import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createDatabase, closeDatabase, migrateDatabase } from '../../db/client';
import { createInterviewHistory } from './history';
import type { ContentSnapshot } from '../interview-content/types';

const databases: Array<{ handle: ReturnType<typeof createDatabase>; directory: string }> = [];

const snapshot: ContentSnapshot = {
  version: '2026-08-27',
  hash: 'a'.repeat(64),
  candidateProfileVersion: 'profile-v1',
  candidateProfileHash: 'b'.repeat(64),
  interviewBriefVersion: 'brief-v1',
  interviewBriefHash: 'c'.repeat(64),
  candidateProfile: 'candidate profile at session start',
  interviewBrief: 'interview brief at session start',
};

function newHistory() {
  return newHistoryWithDatabase().history;
}

function newHistoryWithDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-history-'));
  const database = createDatabase(path.join(directory, 'history.sqlite'));
  migrateDatabase(database);
  databases.push({ handle: database, directory });
  return { history: createInterviewHistory(database.db), handle: database };
}

afterEach(() => {
  for (const { handle, directory } of databases.splice(0)) {
    closeDatabase(handle);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('InterviewHistory', () => {
  it('starts a session with immutable content snapshots', async () => {
    const history = newHistory();
    const id = await history.start({
      startedAt: new Date('2026-08-28T01:00:00.000Z'),
      targetDurationMs: 45 * 60_000,
      snapshot,
    });

    const detail = await history.detail(id);
    expect(detail?.session.result).toBe('in_progress');
    expect(detail?.session.targetDurationMs).toBe(45 * 60_000);
    expect(detail?.snapshot).toEqual(snapshot);
  });

  it('rejects malformed boundary values before writing', async () => {
    const history = newHistory();
    await expect(history.start({ snapshot, startedAt: 1, targetDurationMs: 1.5 })).rejects.toThrow();
    const id = await history.start({ snapshot, startedAt: 1, targetDurationMs: 2_700_000 });
    await expect(history.appendFinalTurn({ sessionId: id, providerTurnId: 'x', sequence: 1, speaker: 'candidate', text: 'x', startedAt: 3, endedAt: 2 })).rejects.toThrow();
    await expect(history.finish(id, 'completed', 'complete', -1)).rejects.toThrow();
    await expect(history.finish(id, 'completed', 'bogus' as never, 1)).rejects.toThrow();
    await expect(history.delete('   ')).rejects.toThrow();
    await expect(history.appendFinalTurn({ sessionId: id, providerTurnId: 'bad-speaker', sequence: 1, speaker: 'other' as never, text: 'x', startedAt: 3, endedAt: 4 })).rejects.toThrow();
  });

  it('appends final turns in sequence order and deduplicates a provider turn id per session', async () => {
    const history = newHistory();
    const id = await history.start({ snapshot, startedAt: 1, targetDurationMs: 2_700_000 });
    expect(await history.appendFinalTurn({
      sessionId: id,
      providerTurnId: 'provider-1',
      sequence: 1,
      speaker: 'candidate',
      text: '第一轮',
      startedAt: 10,
      endedAt: 20,
    })).toBe('inserted');
    expect(await history.appendFinalTurn({
      sessionId: id,
      providerTurnId: 'provider-2',
      sequence: 2,
      speaker: 'ai',
      text: '第二轮',
      startedAt: 20,
      endedAt: 30,
    })).toBe('inserted');
    expect(await history.appendFinalTurn({
      sessionId: id,
      providerTurnId: 'provider-2',
      sequence: 2,
      speaker: 'ai',
      text: '重复事件',
      startedAt: 20,
      endedAt: 30,
    })).toBe('duplicate');

    const detail = await history.detail(id);
    expect(detail?.turns.map((turn) => turn.sequence)).toEqual([1, 2]);
    expect(detail?.turns[1]?.text).toBe('第二轮');
  });

  it('allows exactly one transition from in-progress to a terminal result', async () => {
    const history = newHistory();
    const id = await history.start({ snapshot, startedAt: new Date('2026-08-28T01:00:00Z'), targetDurationMs: 2_700_000 });
    await history.finish(id, 'completed', 'complete', 1234);
    await expect(history.finish(id, 'cancelled', 'missing', 2)).rejects.toThrow('已结束');
    expect((await history.detail(id))?.session.result).toBe('completed');
  });

  it('surfaces session-level transcript incompleteness in history summaries', async () => {
    const history = newHistory();
    const id = await history.start({ snapshot, startedAt: 1, targetDurationMs: 2_700_000 });
    await history.finish(id, 'interrupted', 'missing', 0);

    expect((await history.list())[0]?.hasTranscriptGap).toBe(true);
    expect((await history.detail(id))?.session.hasTranscriptGap).toBe(true);
  });

  it('recovers only abandoned in-progress sessions as interrupted', async () => {
    const history = newHistory();
    const abandoned = await history.start({ snapshot, startedAt: 1, targetDurationMs: 2_700_000 });
    const completed = await history.start({ snapshot, startedAt: 1, targetDurationMs: 2_700_000 });
    await history.finish(completed, 'completed', 'complete', 10);

    expect(await history.recoverAbandoned()).toBe(1);
    expect((await history.detail(abandoned))?.session.result).toBe('interrupted');
    expect(await history.recoverAbandoned()).toBe(0);
  });

  it('stores feedback retry state independently from the session result', async () => {
    const history = newHistory();
    const id = await history.start({ snapshot, startedAt: 1, targetDurationMs: 2_700_000 });
    await history.appendFinalTurn({ sessionId: id, providerTurnId: 'candidate-1', sequence: 1, speaker: 'candidate', text: '回答', startedAt: 1, endedAt: 2 });
    await history.finish(id, 'completed', 'complete', 10);
    await history.setFeedback(id, { status: 'generating' });
    await history.setFeedback(id, { status: 'failed', failureType: 'model_timeout' });
    expect((await history.detail(id))?.feedback?.status).toBe('failed');
    await history.setFeedback(id, { status: 'generating' });
    await history.setFeedback(id, { status: 'completed', generatedAt: new Date('2026-08-28T02:00:00Z'), result: { dimensions: [] } });
    expect((await history.detail(id))?.session.result).toBe('completed');
    expect((await history.detail(id))?.feedback?.status).toBe('completed');
    await expect(history.setFeedback(id, { status: 'not_applicable' })).rejects.toThrow();
  });

  it('deletes a session and all dependent rows atomically', async () => {
    const { history, handle } = newHistoryWithDatabase();
    const id = await history.start({ snapshot, startedAt: 1, targetDurationMs: 2_700_000 });
    await history.appendFinalTurn({ sessionId: id, providerTurnId: 'turn-1', sequence: 1, speaker: 'candidate', text: '回答', startedAt: 1, endedAt: 2 });
    await history.finish(id, 'completed', 'complete', 10);
    await history.setFeedback(id, { status: 'generating' });
    await history.setFeedback(id, { status: 'failed', failureType: 'invalid_output' });
    await history.delete(id);
    expect(await history.detail(id)).toBeNull();
    expect(await history.list()).toHaveLength(0);
    const dependentTables = ['content_snapshots', 'interview_turns', 'interview_feedback'] as const;
    for (const table of dependentTables) {
      const row = handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE session_id = ?`).get(id) as { count: number };
      expect(row.count, `${table} rows should cascade on session deletion`).toBe(0);
    }
  });
});
