import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { AppDatabase } from '../../db/client';
import { contentSnapshots, interviewFeedback, interviewSessions, interviewTurns } from '../../db/schema';
import type {
  FeedbackRecord,
  FeedbackUpdate,
  FinalTurn,
  DateLike,
  InterviewHistory,
  SessionDetail,
  SessionId,
  SessionResult,
  SessionSummary,
  StartSession,
  TranscriptTurn,
  TurnSpeaker,
} from './types';
import type { TranscriptCompleteness } from './types';

function validTimestamp(value: Date | number, label: string): number {
  const timestamp = value instanceof Date ? value.getTime() : value;
  if (!Number.isFinite(timestamp) || !Number.isSafeInteger(timestamp)) throw new Error(`${label}必须是有效时间戳`);
  return timestamp;
}

function nonempty(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label}不能为空`);
  return value;
}

function validSnapshot(snapshot: StartSession['snapshot']): void {
  if (!snapshot) throw new Error('开始面试需要内容快照');
  nonempty(snapshot.version, '内容版本');
  nonempty(snapshot.hash, '内容哈希');
  nonempty(snapshot.candidateProfileVersion, '候选人画像版本');
  nonempty(snapshot.candidateProfileHash, '候选人画像哈希');
  nonempty(snapshot.interviewBriefVersion, '面试说明版本');
  nonempty(snapshot.interviewBriefHash, '面试说明哈希');
  nonempty(snapshot.candidateProfile, '候选人画像');
  nonempty(snapshot.interviewBrief, '面试说明');
  for (const hash of [snapshot.hash, snapshot.candidateProfileHash, snapshot.interviewBriefHash]) {
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new Error('内容哈希格式无效');
  }
}
function terminal(result: string): result is Exclude<SessionResult, 'in_progress'> {
  return result === 'completed' || result === 'interrupted' || result === 'cancelled';
}

function speaker(value: TurnSpeaker): 'candidate' | 'ai' {
  if (value !== 'candidate' && value !== 'ai') throw new Error('说话方必须是 candidate 或 ai');
  return value;
}

function summary(row: typeof interviewSessions.$inferSelect, feedbackStatus: string | undefined, hasTranscriptGap: boolean): SessionSummary {
  const completeness = row.transcriptCompleteness as TranscriptCompleteness;
  return {
    id: row.id,
    startedAt: new Date(row.startedAt),
    endedAt: row.endedAt === null ? null : new Date(row.endedAt),
    targetDurationMs: row.targetDurationMs,
    actualDurationMs: row.actualDurationMs,
    result: row.result as SessionResult,
    completeness,
    feedbackStatus: (feedbackStatus ?? 'pending') as SessionSummary['feedbackStatus'],
    hasTranscriptGap: hasTranscriptGap || completeness === 'missing',
  };
}

function transcriptTurn(row: typeof interviewTurns.$inferSelect): TranscriptTurn {
  return {
    id: row.id,
    providerTurnId: row.providerTurnId,
    sequence: row.sequence,
    speaker: row.speaker === 'candidate' ? 'candidate' : 'ai',
    text: row.text,
    startedAt: row.startedAt === null ? null : new Date(row.startedAt),
    endedAt: row.endedAt === null ? null : new Date(row.endedAt),
    hasGap: row.hasGap,
  };
}

function feedbackRecord(row: typeof interviewFeedback.$inferSelect | undefined): FeedbackRecord | null {
  if (!row) return null;
  return {
    status: row.status as FeedbackRecord['status'],
    failureType: row.failureType,
    result: row.resultJson === null ? null : JSON.parse(row.resultJson),
    generatedAt: row.generatedAt === null ? null : new Date(row.generatedAt),
  };
}

export function createInterviewHistory(db: AppDatabase): InterviewHistory {
  return {
    async start(input: StartSession): Promise<SessionId> {
      const id = input.id ?? randomUUID();
      const snapshot = input.snapshot;
      nonempty(id, '会话 ID');
      validSnapshot(snapshot);
      const startedAt = validTimestamp(input.startedAt, '开始时间');
      const targetDurationMs = input.targetDurationMs;
      if (!Number.isSafeInteger(targetDurationMs) || targetDurationMs <= 0 || targetDurationMs > 7 * 24 * 60 * 60_000) throw new Error('面试目标时长必须为正安全整数');

      db.transaction((tx) => {
        tx.insert(interviewSessions).values({
          id,
          startedAt,
          targetDurationMs: Math.floor(targetDurationMs),
          result: 'in_progress',
          transcriptCompleteness: 'complete',
        }).run();
        tx.insert(contentSnapshots).values({
          id: randomUUID(),
          sessionId: id,
          version: snapshot.version,
          hash: snapshot.hash,
          candidateProfileVersion: snapshot.candidateProfileVersion,
          candidateProfileHash: snapshot.candidateProfileHash,
          interviewBriefVersion: snapshot.interviewBriefVersion,
          interviewBriefHash: snapshot.interviewBriefHash,
          candidateProfile: snapshot.candidateProfile,
          interviewBrief: snapshot.interviewBrief,
        }).run();
        tx.insert(interviewFeedback).values({
          id: randomUUID(),
          sessionId: id,
          status: 'pending',
        }).run();
      });
      return id;
    },

    async appendFinalTurn(input: FinalTurn): Promise<'inserted' | 'duplicate'> {
      nonempty(input.sessionId, '会话 ID');
      nonempty(input.providerTurnId, '供应商轮次 ID');
      nonempty(input.text, '转写文本');
      if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) throw new Error('转写轮次序号必须为正安全整数');
      const startedAt = validTimestamp(input.startedAt, '转写开始时间');
      const endedAt = validTimestamp(input.endedAt, '转写结束时间');
      if (endedAt < startedAt) throw new Error('转写结束时间不能早于开始时间');
      speaker(input.speaker);
      return db.transaction((tx) => {
        const session = tx.select().from(interviewSessions).where(eq(interviewSessions.id, input.sessionId)).get();
        if (!session) throw new Error('面试会话不存在');
        if (session.result !== 'in_progress') throw new Error('会话已结束，不能追加转写');

        const existing = tx.select({ id: interviewTurns.id }).from(interviewTurns)
          .where(and(eq(interviewTurns.sessionId, input.sessionId), eq(interviewTurns.providerTurnId, input.providerTurnId))).get();
        if (existing) return 'duplicate';

        const latest = tx.select({ sequence: interviewTurns.sequence }).from(interviewTurns)
          .where(eq(interviewTurns.sessionId, input.sessionId)).orderBy(desc(interviewTurns.sequence)).limit(1).get();
        if (latest && input.sequence !== latest.sequence + 1) throw new Error('转写轮次序号必须严格递增');

        const inserted = tx.insert(interviewTurns).values({
          id: randomUUID(),
          sessionId: input.sessionId,
          providerTurnId: input.providerTurnId,
          sequence: input.sequence,
          speaker: speaker(input.speaker),
          text: input.text,
          startedAt,
          endedAt,
          hasGap: input.hasGap ?? false,
        }).onConflictDoNothing({ target: [interviewTurns.sessionId, interviewTurns.providerTurnId] }).run();
        return inserted.changes === 0 ? 'duplicate' : 'inserted';
      }, { behavior: 'immediate' });
    },

    async finish(id: SessionId, result: Exclude<SessionResult, 'in_progress'>, completeness: TranscriptCompleteness, actualDurationMs: number): Promise<void> {
      if (!terminal(result)) throw new Error('非法的会话结果');
      if (completeness !== 'complete' && completeness !== 'missing') throw new Error('非法的转写完整性');
      if (!Number.isSafeInteger(actualDurationMs) || actualDurationMs < 0 || actualDurationMs > 7 * 24 * 60 * 60_000) throw new Error('实际面试时长必须为非负安全整数');
      db.transaction((tx) => {
        const session = tx.select().from(interviewSessions).where(eq(interviewSessions.id, id)).get();
        if (!session) throw new Error('面试会话不存在');
        if (session.result !== 'in_progress') throw new Error('会话已结束，不能再次结束');
        const endedAt = Date.now();
        tx.update(interviewSessions).set({
          endedAt,
          actualDurationMs,
          result,
          transcriptCompleteness: completeness,
        }).where(eq(interviewSessions.id, id)).run();

        const candidateTurn = tx.select({ id: interviewTurns.id }).from(interviewTurns)
          .where(and(eq(interviewTurns.sessionId, id), eq(interviewTurns.speaker, 'candidate'))).limit(1).get();
        const feedbackStatus = result === 'completed' && candidateTurn ? 'pending' : 'not_applicable';
        tx.update(interviewFeedback).set({ status: feedbackStatus }).where(eq(interviewFeedback.sessionId, id)).run();
      });
    },

    async setFeedback(id: SessionId, update: FeedbackUpdate): Promise<void> {
      const status = update.status;
      if (!['pending', 'generating', 'completed', 'failed', 'not_applicable'].includes(status)) throw new Error('非法的反馈状态');
      const resultJson = update.result === undefined ? undefined : JSON.stringify(update.result);
      db.transaction((tx) => {
        const session = tx.select().from(interviewSessions).where(eq(interviewSessions.id, id)).get();
        if (!session) throw new Error('面试会话不存在');
        const candidate = tx.select({ id: interviewTurns.id }).from(interviewTurns)
          .where(and(eq(interviewTurns.sessionId, id), eq(interviewTurns.speaker, 'candidate'))).limit(1).get();
        const eligible = session.result === 'completed' && Boolean(candidate);
        if (status !== 'not_applicable' && !eligible) throw new Error('当前会话不可生成反馈');
        if (status === 'not_applicable' && eligible) throw new Error('已完成会话不能标记为不适用');
        const feedback = tx.select().from(interviewFeedback).where(eq(interviewFeedback.sessionId, id)).get();
        if (feedback && feedback.status !== status) {
          const allowed: Record<string, string[]> = { pending: ['generating', 'not_applicable'], generating: ['completed', 'failed'], failed: ['generating'], completed: [], not_applicable: [] };
          if (!allowed[feedback.status]?.includes(status)) throw new Error('非法的反馈状态迁移');
        }
        if (status === 'completed') {
          if (resultJson === undefined || update.generatedAt === undefined) throw new Error('完成反馈需要结果和生成时间');
          validTimestamp(update.generatedAt, '反馈生成时间');
        }
        if (status === 'failed') nonempty(update.failureType ?? '', '反馈失败类型');
        const values = status === 'not_applicable' || status === 'pending' || status === 'generating'
          ? { status, failureType: null, resultJson: null, generatedAt: null }
          : status === 'failed'
            ? { status, failureType: nonempty(update.failureType ?? '', '反馈失败类型'), resultJson: null, generatedAt: null }
            : { status, failureType: null, resultJson: resultJson as string, generatedAt: validTimestamp(update.generatedAt as DateLike, '反馈生成时间') };
        if (feedback) tx.update(interviewFeedback).set(values).where(eq(interviewFeedback.sessionId, id)).run();
        else tx.insert(interviewFeedback).values({ id: randomUUID(), sessionId: id, ...values }).run();
      });
    },

    async list(): Promise<SessionSummary[]> {
      const rows = db.select({
        session: interviewSessions,
        feedbackStatus: interviewFeedback.status,
        hasTranscriptGap: sql<number>`coalesce(max(${interviewTurns.hasGap}), 0)`,
      }).from(interviewSessions)
        .leftJoin(interviewFeedback, eq(interviewFeedback.sessionId, interviewSessions.id))
        .leftJoin(interviewTurns, eq(interviewTurns.sessionId, interviewSessions.id))
        .groupBy(interviewSessions.id)
        .orderBy(desc(interviewSessions.startedAt)).all();
      return rows.map((row) => summary(row.session, row.feedbackStatus ?? undefined, row.hasTranscriptGap === 1));
    },

    async detail(id: SessionId): Promise<SessionDetail | null> {
      const session = db.select().from(interviewSessions).where(eq(interviewSessions.id, id)).get();
      if (!session) return null;
      const snapshotRow = db.select().from(contentSnapshots).where(eq(contentSnapshots.sessionId, id)).get();
      if (!snapshotRow) throw new Error('面试内容快照缺失');
      const turns = db.select().from(interviewTurns).where(eq(interviewTurns.sessionId, id)).orderBy(asc(interviewTurns.sequence)).all();
      const feedback = db.select().from(interviewFeedback).where(eq(interviewFeedback.sessionId, id)).get();
      const hasTranscriptGap = turns.some((turn) => turn.hasGap);
      return {
        session: summary(session, feedback?.status, hasTranscriptGap),
        snapshot: {
          version: snapshotRow.version,
          hash: snapshotRow.hash,
          candidateProfileVersion: snapshotRow.candidateProfileVersion,
          candidateProfileHash: snapshotRow.candidateProfileHash,
          interviewBriefVersion: snapshotRow.interviewBriefVersion,
          interviewBriefHash: snapshotRow.interviewBriefHash,
          candidateProfile: snapshotRow.candidateProfile,
          interviewBrief: snapshotRow.interviewBrief,
        },
        turns: turns.map(transcriptTurn),
        feedback: feedbackRecord(feedback),
      };
    },

    async delete(id: SessionId): Promise<void> {
      nonempty(id, '会话 ID');
      db.transaction((tx) => {
        tx.delete(interviewSessions).where(eq(interviewSessions.id, id)).run();
      });
    },

    async recoverAbandoned(): Promise<number> {
      return db.transaction((tx) => {
        const sessions = tx.select().from(interviewSessions).where(eq(interviewSessions.result, 'in_progress')).all();
        const endedAt = Date.now();
        for (const session of sessions) {
          tx.update(interviewSessions).set({
            endedAt,
            actualDurationMs: null,
            result: 'interrupted',
          }).where(eq(interviewSessions.id, session.id)).run();
          tx.update(interviewFeedback).set({ status: 'not_applicable' }).where(eq(interviewFeedback.sessionId, session.id)).run();
        }
        return sessions.length;
      });
    },
  };
}
