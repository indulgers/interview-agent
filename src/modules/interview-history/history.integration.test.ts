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
  candidateProfile: 'candidate profile at session start',
  interviewBrief: 'interview brief at session start',
};

function newHistory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'interview-history-'));
  const database = createDatabase(path.join(directory, 'history.sqlite'));
  migrateDatabase(database);
  databases.push({ handle: database, directory });
  return createInterviewHistory(database.db);
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

  it('appends final turns in sequence order and deduplicates a provider turn id per session', async () => {
    const history = newHistory();
    const id = await history.start({ snapshot });
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
    const id = await history.start({ snapshot, startedAt: new Date('2026-08-28T01:00:00Z') });
    await history.finish(id, 'completed', 'complete');
    await expect(history.finish(id, 'cancelled', 'missing')).rejects.toThrow('已结束');
    expect((await history.detail(id))?.session.result).toBe('completed');
  });

  it('recovers only abandoned in-progress sessions as interrupted', async () => {
    const history = newHistory();
    const abandoned = await history.start({ snapshot });
    const completed = await history.start({ snapshot });
    await history.finish(completed, 'completed', 'complete');

    expect(await history.recoverAbandoned()).toBe(1);
    expect((await history.detail(abandoned))?.session.result).toBe('interrupted');
    expect(await history.recoverAbandoned()).toBe(0);
  });

  it('stores feedback retry state independently from the session result', async () => {
    const history = newHistory();
    const id = await history.start({ snapshot });
    await history.appendFinalTurn({ sessionId: id, providerTurnId: 'candidate-1', sequence: 1, speaker: 'candidate', text: '回答' });
    await history.finish(id, 'completed', 'complete');
    await history.setFeedback(id, { status: 'failed', failureType: 'model_timeout' });
    expect((await history.detail(id))?.feedback?.status).toBe('failed');
    await history.setFeedback(id, { status: 'generating' });
    await history.setFeedback(id, { status: 'completed', generatedAt: new Date('2026-08-28T02:00:00Z'), result: { dimensions: [] } });
    expect((await history.detail(id))?.session.result).toBe('completed');
    expect((await history.detail(id))?.feedback?.status).toBe('completed');
  });

  it('deletes a session and all dependent rows atomically', async () => {
    const history = newHistory();
    const id = await history.start({ snapshot });
    await history.appendFinalTurn({ sessionId: id, providerTurnId: 'turn-1', sequence: 1, speaker: 'candidate', text: '回答' });
    await history.setFeedback(id, { status: 'failed', failureType: 'invalid_output' });
    await history.delete(id);
    expect(await history.detail(id)).toBeNull();
    expect(await history.list()).toHaveLength(0);
  });
});
