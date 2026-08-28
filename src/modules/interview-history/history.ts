import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import type { AppDatabase } from '../../db/client';
import { contentSnapshots, interviewFeedback, interviewSessions, interviewTurns } from '../../db/schema';
import type {
  FeedbackRecord,
  FeedbackUpdate,
  FinalTurn,
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

const DEFAULT_TARGET_DURATION_MS = 45 * 60_000;

function milliseconds(value: Date | number | undefined, fallback: number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  return fallback;
}
function terminal(result: string): result is Exclude<SessionResult, 'in_progress'> {
  return result === 'completed' || result === 'interrupted' || result === 'cancelled';
}

function speaker(value: TurnSpeaker): 'candidate' | 'ai' {
  if (value === 'candidate') return value;
  return 'ai';
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
    transcriptCompleteness: completeness,
    feedbackStatus: (feedbackStatus ?? 'pending') as SessionSummary['feedbackStatus'],
    hasTranscriptGap,
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
      const snapshot = input.snapshot ?? input.contentSnapshot;
      if (!snapshot) throw new Error('开始面试需要内容快照');
      const startedAt = milliseconds(input.startedAt, Date.now());
      const targetDurationMs = input.targetDurationMs ?? DEFAULT_TARGET_DURATION_MS;
      if (!Number.isFinite(targetDurationMs) || targetDurationMs <= 0) throw new Error('面试目标时长必须为正数');

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
      return db.transaction((tx) => {
        const session = tx.select().from(interviewSessions).where(eq(interviewSessions.id, input.sessionId)).get();
        if (!session) throw new Error('面试会话不存在');
        if (session.result !== 'in_progress') throw new Error('会话已结束，不能追加转写');

        const existing = tx.select({ id: interviewTurns.id }).from(interviewTurns)
          .where(and(eq(interviewTurns.sessionId, input.sessionId), eq(interviewTurns.providerTurnId, input.providerTurnId))).get();
        if (existing) return 'duplicate';
        if (!Number.isInteger(input.sequence) || input.sequence < 1) throw new Error('转写轮次序号必须从 1 开始');
        const latest = tx.select({ sequence: interviewTurns.sequence }).from(interviewTurns)
          .where(eq(interviewTurns.sessionId, input.sessionId)).orderBy(desc(interviewTurns.sequence)).limit(1).get();
        if (latest && input.sequence !== latest.sequence + 1) throw new Error('转写轮次序号必须严格递增');

        tx.insert(interviewTurns).values({
          id: randomUUID(),
          sessionId: input.sessionId,
          providerTurnId: input.providerTurnId,
          sequence: input.sequence,
          speaker: speaker(input.speaker),
          text: input.text,
          startedAt: input.startedAt === undefined ? null : milliseconds(input.startedAt, Date.now()),
          endedAt: input.endedAt === undefined ? null : milliseconds(input.endedAt, Date.now()),
          hasGap: input.hasGap ?? input.transcriptCompleteness === 'missing',
        }).run();
        return 'inserted';
      });
    },

    async finish(id: SessionId, result: Exclude<SessionResult, 'in_progress'>, completeness: TranscriptCompleteness): Promise<void> {
      if (!terminal(result)) throw new Error('非法的会话结果');
      db.transaction((tx) => {
        const session = tx.select().from(interviewSessions).where(eq(interviewSessions.id, id)).get();
        if (!session) throw new Error('面试会话不存在');
        if (session.result !== 'in_progress') throw new Error('会话已结束，不能再次结束');
        const endedAt = Date.now();
        const actualDurationMs = Math.max(0, endedAt - session.startedAt);
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
        const session = tx.select({ id: interviewSessions.id }).from(interviewSessions).where(eq(interviewSessions.id, id)).get();
        if (!session) throw new Error('面试会话不存在');
        const feedback = tx.select({ id: interviewFeedback.id }).from(interviewFeedback).where(eq(interviewFeedback.sessionId, id)).get();
        const values = {
          status,
          failureType: update.failureType ?? null,
          ...(resultJson === undefined ? {} : { resultJson }),
          ...(update.generatedAt === undefined ? {} : { generatedAt: milliseconds(update.generatedAt, Date.now()) }),
        };
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
          candidateProfile: snapshotRow.candidateProfile,
          interviewBrief: snapshotRow.interviewBrief,
        },
        turns: turns.map(transcriptTurn),
        feedback: feedbackRecord(feedback),
      };
    },

    async delete(id: SessionId): Promise<void> {
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
            actualDurationMs: Math.max(0, endedAt - session.startedAt),
            result: 'interrupted',
          }).where(eq(interviewSessions.id, session.id)).run();
          tx.update(interviewFeedback).set({ status: 'not_applicable' }).where(eq(interviewFeedback.sessionId, session.id)).run();
        }
        return sessions.length;
      });
    },
  };
}
