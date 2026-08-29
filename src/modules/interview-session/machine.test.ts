import { describe, expect, it } from 'vitest';

import { createContentSnapshot } from '../interview-content/content';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDatabase, closeDatabase, migrateDatabase } from '../../db/client';
import { createInterviewHistory } from '../interview-history/history';
import type { InterviewHistory, StartSession, FinalTurn } from '../interview-history/types';
import { MemoryRealtimeVoice } from '../realtime-voice/memory-realtime-voice';
import type { Clock, Scheduler } from './types';
import { createInterviewSession } from './machine';

class FakeTime implements Clock, Scheduler {
  private current = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();
  now() { return this.current; }
  schedule(fn: () => void, delayMs: number) {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.current + delayMs, fn });
    return () => this.tasks.delete(id);
  }
  advance(ms: number) {
    const end = this.current + ms;
    while (true) {
      const due = [...this.tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.current = due[1].at;
      this.tasks.delete(due[0]);
      due[1].fn();
    }
    this.current = end;
  }
}

class MemoryHistory implements InterviewHistory {
  async claimFeedback() { return true; }
  starts: StartSession[] = [];
  turns: FinalTurn[] = [];
  finishes: Array<{ id: string; result: 'completed' | 'interrupted' | 'cancelled'; completeness: 'complete' | 'missing'; actualDurationMs: number }> = [];
  async start(input: StartSession) { this.starts.push(input); return `session-${this.starts.length}`; }
  async appendFinalTurn(input: FinalTurn) { if (this.turns.some((turn) => turn.providerTurnId === input.providerTurnId)) return 'duplicate' as const; this.turns.push(input); return 'inserted' as const; }
  async finish(id: string, result: 'completed' | 'interrupted' | 'cancelled', completeness: 'complete' | 'missing', actualDurationMs: number) { this.finishes.push({ id, result, completeness, actualDurationMs }); }
  async setFeedback() {}
  async list() { return []; }
  async detail() { return null; }
  async delete() {}
  async recoverAbandoned() { return 0; }
}

class FaultyHistory extends MemoryHistory {
  appendFailures = 0;
  finishFailures = 0;
  startFailures = 0;
  finishGate: Promise<void> | null = null;
  finishStarted = false;

  override async start(input: StartSession) {
    if (this.startFailures > 0) {
      this.startFailures--;
      throw new Error('history start failed');
    }
    return super.start(input);
  }

  override async appendFinalTurn(input: FinalTurn) {
    if (this.appendFailures > 0) {
      this.appendFailures--;
      throw new Error('append failed');
    }
    return super.appendFinalTurn(input);
  }

  override async finish(...input: Parameters<InterviewHistory['finish']>) {
    this.finishStarted = true;
    if (this.finishGate) await this.finishGate;
    if (this.finishFailures > 0) {
      this.finishFailures--;
      throw new Error('finish failed');
    }
    return super.finish(...input);
  }
}

async function flush() { await new Promise<void>((resolve) => setImmediate(resolve)); await new Promise<void>((resolve) => setImmediate(resolve)); }

async function started() {
  const time = new FakeTime();
  const history = new MemoryHistory();
  const voice = new MemoryRealtimeVoice();
  const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
  await session.start({ microphone: true, camera: true });
  return { time, history, voice, session };
}

describe('InterviewSession', () => {
  it('serializes burst final events against the real SQLite history sequence invariant', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-burst-'));
    const handle = createDatabase(path.join(directory, 'history.sqlite')); migrateDatabase(handle);
    try {
      const time = new FakeTime(); const voice = new MemoryRealtimeVoice();
      const session = createInterviewSession({ clock: time, scheduler: time, history: createInterviewHistory(handle.db), voice, snapshot: createContentSnapshot() });
      await session.start({ microphone: true, camera: true });
      await Promise.all([
        voice.emit({ type: 'final_turn', providerTurnId: 'burst-1', speaker: 'candidate', text: '第一轮', startedAt: 1, endedAt: 2 }),
        voice.emit({ type: 'final_turn', providerTurnId: 'burst-2', speaker: 'ai', text: '第二轮', startedAt: 3, endedAt: 4 }),
      ]);
      const detail = await createInterviewHistory(handle.db).detail((await createInterviewHistory(handle.db).list())[0]!.id);
      expect(detail?.turns.map((turn) => turn.sequence)).toEqual([1, 2]);
    } finally { closeDatabase(handle); fs.rmSync(directory, { recursive: true, force: true }); }
  });
  it('requires both microphone and camera before connecting', async () => {
    const time = new FakeTime(); const history = new MemoryHistory(); const voice = new MemoryRealtimeVoice();
    const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
    await expect(session.start({ microphone: true, camera: false })).rejects.toThrow('microphone and camera');
    expect(history.starts).toHaveLength(0);
    expect(voice.connections).toHaveLength(0);
  });

  it('connects before creating history and exposes listening, thinking, and speaking', async () => {
    const { history, voice, session } = await started();
    expect(history.starts).toHaveLength(1);
    expect(session.view().state).toBe('listening');
    voice.emit({ type: 'response', state: 'started', at: 1 }); await flush();
    expect(session.view().state).toBe('thinking');
    voice.emit({ type: 'assistant_speech', state: 'started', at: 2 }); await flush();
    expect(session.view().state).toBe('speaking');
  });

  it('cancels assistant speech when the candidate barges in', async () => {
    const { voice, session } = await started();
    voice.emit({ type: 'assistant_speech', state: 'started', at: 1 }); await flush();
    voice.emit({ type: 'candidate_speech', state: 'started', at: 2 }); await flush();
    expect(session.view().state).toBe('listening');
    expect(session.view().answerSubmission).toBe('idle');
    expect(voice.connections[0]?.cancelAssistantSpeechCount).toBe(1);
  });

  it('returns to listening when a response completes without audio playback', async () => {
    const { voice, session } = await started();
    voice.emit({ type: 'response', state: 'started', at: 1 }); await flush();
    voice.emit({ type: 'response', state: 'completed', at: 2 }); await flush();
    expect(session.view().state).toBe('listening');
  });

  it('exposes the session id and submits an answer only after the candidate explicitly signals completion', async () => {
    const time = new FakeTime(); const history = new MemoryHistory(); const voice = new MemoryRealtimeVoice();
    const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
    expect(session.view()).toMatchObject({ sessionId: null, answerSubmission: 'idle' });
    await session.start({ microphone: true, camera: true });
    expect(session.view().sessionId).toBe('session-1');

    await voice.emit({ type: 'candidate_speech', state: 'stopped', at: time.now() });
    expect(voice.connections[0]?.submitAnswerCount).toBe(0);
    expect(session.view().state).toBe('listening');

    const submission = session.signalEndOfAnswer();
    expect(session.view().answerSubmission).toBe('submitting');
    await submission;
    expect(voice.connections[0]?.submitAnswerCount).toBe(1);
    expect(session.view()).toMatchObject({ state: 'thinking', answerSubmission: 'idle' });
  });

  it('marks a rejected answer submission as failed and permits an explicit retry', async () => {
    const { voice, session } = await started();
    voice.connections[0]?.rejectSubmit(new Error('provider rejected submission'));

    await expect(session.signalEndOfAnswer()).rejects.toThrow('provider rejected submission');
    expect(session.view()).toMatchObject({ state: 'listening', answerSubmission: 'failed' });

    await session.signalEndOfAnswer();
    expect(voice.connections[0]?.submitAnswerCount).toBe(2);
    expect(session.view()).toMatchObject({ state: 'thinking', answerSubmission: 'idle' });
  });

  it('shares one answer submission across a double click', async () => {
    const { voice, session } = await started();
    let release!: () => void;
    voice.connections[0]?.deferSubmit(new Promise<void>((resolve) => { release = resolve; }));

    const first = session.signalEndOfAnswer();
    const second = session.signalEndOfAnswer();
    expect(second).toBe(first);
    expect(voice.connections[0]?.submitAnswerCount).toBe(1);
    expect(session.view().answerSubmission).toBe('submitting');

    release();
    await first;
    expect(session.view()).toMatchObject({ state: 'thinking', answerSubmission: 'idle' });
  });

  it('rejects answer submission while reconnecting without using the stale connection', async () => {
    const { voice, session } = await started();
    voice.deferNextConnect();
    await voice.emit({ type: 'connection', state: 'disconnected', at: 0 });
    expect(session.view().state).toBe('reconnecting');

    await expect(session.signalEndOfAnswer()).rejects.toThrow('语音连接尚未就绪。');
    expect(voice.connections[0]?.submitAnswerCount).toBe(0);
    expect(session.view().answerSubmission).toBe('failed');
  });

  it('pauses immediately on disconnect, reconnects within 20 seconds, and does not count the pause', async () => {
    const { time, voice, session } = await started();
    time.advance(1_000);
    const delayedReconnect = voice.deferNextConnect();
    voice.emit({ type: 'connection', state: 'disconnected', at: 1_000 }); await flush();
    expect(session.view().state).toBe('reconnecting');
    time.advance(2_000); await flush();
    expect(session.view().activeDurationMs).toBe(1_000);
    expect(session.view().state).toBe('listening');
    expect(voice.connections).toHaveLength(2);
    expect(voice.connections[1]?.injectedProgress).toEqual([{
      phase: 'intro',
      coveredTopics: [],
      evidence: [],
      pendingFollowUps: [],
      updatedThroughSequence: 0,
    }]);
    time.advance(8_000); await flush();
    expect(session.view().activeDurationMs).toBe(9_000);
    const staleReconnect = delayedReconnect.resolve();
    await flush();
    expect(staleReconnect.closed).toBe(true);
    expect(staleReconnect.injectedProgress).toEqual([]);
  });

  it('marks an unrecovered connection as interrupted after twenty seconds', async () => {
    const { time, voice, history, session } = await started();
    voice.enqueueConnectFailure(new Error('offline'));
    voice.emit({ type: 'connection', state: 'disconnected', at: 0 }); await flush();
    time.advance(20_000); await flush();
    expect(session.view().result).toBe('interrupted');
    expect(history.finishes[0]).toMatchObject({ result: 'interrupted', actualDurationMs: 0 });
  });

  it('keeps the newest reconnect when an earlier deferred connect resolves late', async () => {
    const { time, voice, session } = await started();
    const firstReconnect = voice.deferNextConnect();
    voice.enqueueConnectFailure(new Error('second attempt is offline'));

    await voice.emit({ type: 'connection', state: 'disconnected', at: 0 });
    time.advance(2_000); await flush();
    time.advance(2_000); await flush();

    expect(session.view().state).toBe('listening');
    const lateConnection = firstReconnect.resolve();
    await flush();
    expect(lateConnection.closed).toBe(true);
    await lateConnection.emit({ type: 'connection', state: 'disconnected', at: 4_000 });
    await flush();
    expect(session.view().state).toBe('listening');
  });

  it('keeps reconnect attempts on cadence while the first cadence connection hangs', async () => {
    const { time, history, voice, session } = await started();
    voice.enqueueConnectFailure(new Error('immediate reconnect is offline'));
    const firstReconnect = voice.deferNextConnectAfterQueuedFailures();

    await voice.emit({ type: 'connection', state: 'disconnected', at: 0 });
    expect(session.view().state).toBe('reconnecting');
    expect(voice.connectInputs).toHaveLength(2);

    time.advance(2_000); await flush();
    expect(voice.connectInputs).toHaveLength(3);
    expect(session.view().state).toBe('reconnecting');

    time.advance(2_000); await flush();
    expect(voice.connectInputs).toHaveLength(4);
    expect(voice.connections).toHaveLength(2);
    expect(session.view().state).toBe('listening');

    time.advance(10_000); await flush();
    expect(voice.connectInputs).toHaveLength(4);

    const lateConnection = firstReconnect.resolve();
    await flush();
    expect(lateConnection.closed).toBe(true);
    expect(lateConnection.injectedProgress).toEqual([]);
    await lateConnection.emit({ type: 'final_turn', providerTurnId: 'stale-turn', speaker: 'candidate', text: '不应写入', startedAt: 0, endedAt: 1 });
    expect(history.turns).toEqual([]);
    expect(session.view().state).toBe('listening');
  });

  it('closes a late reconnect after the reconnect deadline has interrupted the session', async () => {
    const { time, voice, session } = await started();
    const delayedReconnect = voice.deferNextConnect();
    await voice.emit({ type: 'connection', state: 'disconnected', at: 0 });
    time.advance(20_000); await flush();

    expect(session.view().result).toBe('interrupted');
    const lateConnection = delayedReconnect.resolve();
    await flush();
    expect(lateConnection.closed).toBe(true);
    expect(session.view().result).toBe('interrupted');
  });

  it('recovers from a rejected initial connection without creating history', async () => {
    const time = new FakeTime(); const history = new MemoryHistory(); const voice = new MemoryRealtimeVoice();
    voice.enqueueConnectFailure(new Error('temporary connect failure'));
    const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });

    await expect(session.start({ microphone: true, camera: true })).rejects.toThrow('temporary connect failure');
    await session.start({ microphone: true, camera: true });

    expect(history.starts).toHaveLength(1);
    expect(session.view().state).toBe('listening');
  });

  it('closes the first connection when history start rejects and permits a later start', async () => {
    const time = new FakeTime(); const history = new FaultyHistory(); const voice = new MemoryRealtimeVoice();
    history.startFailures = 1;
    const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });

    await expect(session.start({ microphone: true, camera: true })).rejects.toThrow('history start failed');
    expect(voice.connections[0]?.closed).toBe(true);
    await session.start({ microphone: true, camera: true });

    expect(session.view().state).toBe('listening');
    expect(history.starts).toHaveLength(1);
  });

  it('persists each final turn immediately and treats duplicate provider ids as harmless', async () => {
    const { history, voice } = await started();
    const turn = { type: 'final_turn' as const, providerTurnId: 'candidate-1', speaker: 'candidate' as const, text: '我负责了接口设计', startedAt: 2, endedAt: 3 };
    voice.emit(turn); await flush();
    voice.emit(turn); await flush();
    expect(history.turns).toHaveLength(1);
    expect(history.turns[0]).toMatchObject({ sequence: 1, startedAt: 2, endedAt: 3 });
  });

  it('pauses safely when final-turn persistence rejects', async () => {
    const time = new FakeTime(); const history = new FaultyHistory(); const voice = new MemoryRealtimeVoice();
    history.appendFailures = 1;
    const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
    await session.start({ microphone: true, camera: true });
    await voice.emit({ type: 'final_turn', providerTurnId: 'append-failure', speaker: 'candidate', text: '回答', startedAt: 0, endedAt: 1 });

    expect(session.view()).toMatchObject({ state: 'paused', error: '会话操作失败' });
    expect(history.turns).toHaveLength(0);
  });

  it('propagates a final-turn transcription gap to terminal history completeness', async () => {
    const { history, voice, session } = await started();
    voice.emit({ type: 'final_turn', providerTurnId: 'partial-candidate', speaker: 'candidate', text: '部分回答', startedAt: 0, endedAt: 1, hasGap: true }); await flush();
    await session.end();
    expect(history.finishes[0]).toMatchObject({ result: 'completed', completeness: 'missing' });
  });

  it('drains an explicitly pending transcript before manually finalizing', async () => {
    const { history, voice, session } = await started();
    await voice.emit({ type: 'transcript', state: 'pending', providerTurnId: 'tail-1', speaker: 'candidate', at: 0 });
    await session.end();
    expect(session.view().state).toBe('closing');
    await voice.emit({ type: 'final_turn', providerTurnId: 'tail-1', speaker: 'candidate', text: '尾部回答', startedAt: 0, endedAt: 1 });
    expect(session.view().result).toBe('completed');
    expect(history.finishes[0]).toMatchObject({ completeness: 'complete' });
  });

  it('stores a missing transcript result after the five-second manual drain expires', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-drain-'));
    const handle = createDatabase(path.join(directory, 'history.sqlite')); migrateDatabase(handle);
    try {
      const time = new FakeTime(); const voice = new MemoryRealtimeVoice();
      const history = createInterviewHistory(handle.db);
      const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
      await session.start({ microphone: true, camera: true });
      await voice.emit({ type: 'transcript', state: 'pending', providerTurnId: 'lost-tail', speaker: 'candidate', at: 0 });
      await session.end();
      time.advance(5_000); await flush();

      const saved = await history.detail((await history.list())[0]!.id);
      expect(saved?.session.completeness).toBe('missing');
      expect(saved?.session.result).toBe('cancelled');
    } finally { closeDatabase(handle); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('persists the terminal SQLite result even when closing realtime voice rejects', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-close-'));
    const handle = createDatabase(path.join(directory, 'history.sqlite')); migrateDatabase(handle);
    try {
      const time = new FakeTime(); const voice = new MemoryRealtimeVoice();
      const history = createInterviewHistory(handle.db);
      const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
      await session.start({ microphone: true, camera: true });
      voice.connections[0]?.rejectClose(new Error('close failed'));
      await session.end();

      const saved = await history.detail((await history.list())[0]!.id);
      expect(saved?.session.result).toBe('cancelled');
      expect(session.view().result).toBe('cancelled');
    } finally { closeDatabase(handle); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('ignores final transcript events emitted after the terminal result', async () => {
    const { history, voice, session } = await started();
    await session.end();
    await voice.connections[0]?.emit({ type: 'final_turn', providerTurnId: 'too-late', speaker: 'candidate', text: '不应写入', startedAt: 0, endedAt: 1 });

    expect(history.turns).toHaveLength(0);
    expect(session.view().result).toBe('cancelled');
  });

  it('cannot resurrect state when a deferred barge-in cancellation races with end', async () => {
    const { voice, session } = await started();
    let releaseCancel!: () => void;
    const cancelGate = new Promise<void>((resolve) => { releaseCancel = resolve; });
    voice.connections[0]?.deferCancel(cancelGate);
    await voice.emit({ type: 'transcript', state: 'pending', providerTurnId: 'deferred-tail', speaker: 'candidate', at: 0 });
    await voice.emit({ type: 'assistant_speech', state: 'started', at: 0 });
    const bargeIn = voice.emit({ type: 'candidate_speech', state: 'started', at: 1 });
    await flush();
    const ending = session.end();
    releaseCancel();
    await bargeIn;
    await ending;

    expect(session.view().state).toBe('closing');
    expect(session.view().result).toBeNull();
    await voice.emit({ type: 'final_turn', providerTurnId: 'deferred-tail', speaker: 'candidate', text: '回答', startedAt: 0, endedAt: 1 });
    expect(session.view().state).toBe('finished');
    expect(session.view().result).toBe('completed');
  });

  it('pauses safely when barge-in cancellation rejects', async () => {
    const { voice, session } = await started();
    voice.connections[0]?.rejectCancel(new Error('cancel failed'));
    await voice.emit({ type: 'assistant_speech', state: 'started', at: 0 });
    await voice.emit({ type: 'candidate_speech', state: 'started', at: 1 });

    expect(session.view()).toMatchObject({ state: 'paused', error: '打断失败，可重试' });
  });

  it('continues when progress injection rejects and retries at a later checkpoint', async () => {
    const { time, history, voice, session } = await started();
    voice.connections[0]?.rejectInject(new Error('inject failed'));
    for (let index = 1; index <= 10; index++) {
      await voice.emit({ type: 'final_turn', providerTurnId: `inject-failure-${index}`, speaker: 'ai', text: `问题 ${index}`, startedAt: index, endedAt: index + 1 });
    }

    expect(session.view().state).toBe('listening');
    expect(session.view().error).toBe('进度更新失败，将在下次检查点重试');
    time.advance(5 * 60_000);
    await flush();
    expect(voice.connections[0]?.injectedProgress).toHaveLength(2);
    expect(history.turns).toHaveLength(10);
  });

  it('continues after progress summarization or injection fails and retries at a later checkpoint', async () => {
    const time = new FakeTime(); const history = new MemoryHistory(); const voice = new MemoryRealtimeVoice();
    let summaries = 0;
    const session = createInterviewSession({
      clock: time,
      scheduler: time,
      history,
      voice,
      snapshot: createContentSnapshot(),
      summarizeProgress: (input) => {
        summaries++;
        if (summaries === 1) throw new Error('summary failed');
        return input.progress;
      },
    });
    await session.start({ microphone: true, camera: true });
    for (let index = 1; index <= 10; index++) {
      await voice.emit({ type: 'final_turn', providerTurnId: `retry-progress-${index}`, speaker: 'ai', text: `问题 ${index}`, startedAt: index, endedAt: index + 1 });
    }
    expect(session.view().state).toBe('listening');
    expect(session.view().error).toBe('进度更新失败，将在下次检查点重试');
    time.advance(5 * 60_000); await flush();

    expect(summaries).toBe(2);
    expect(voice.connections[0]?.injectedProgress).toHaveLength(1);
  });

  it('pauses rather than finishing when history finish rejects, then permits ending again', async () => {
    const time = new FakeTime(); const history = new FaultyHistory(); const voice = new MemoryRealtimeVoice();
    history.finishFailures = 1;
    const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
    await session.start({ microphone: true, camera: true });

    await session.end();
    expect(session.view()).toMatchObject({ state: 'paused', result: null, error: '保存会话结果失败' });
    await session.end();

    expect(session.view().result).toBe('cancelled');
    expect(history.finishes).toHaveLength(1);
  });

  it('keeps a retrying end command pending until terminal history persistence completes', async () => {
    const time = new FakeTime(); const history = new FaultyHistory(); const voice = new MemoryRealtimeVoice();
    let releaseFinish!: () => void;
    history.finishGate = new Promise<void>((resolve) => { releaseFinish = resolve; });
    const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
    await session.start({ microphone: true, camera: true });
    const ending = session.end();
    await flush();

    expect(history.finishStarted).toBe(true);
    expect(session.view().state).toBe('closing');
    let settled = false;
    void ending.finally(() => { settled = true; });
    await flush();
    expect(settled).toBe(false);

    releaseFinish();
    await ending;
    expect(session.view().state).toBe('finished');
    expect(session.view().result).toBe('cancelled');
  });

  it('compacts and injects progress every ten turns, at phase transition, and after reconnect', async () => {
    const { time, voice } = await started();
    for (let index = 1; index <= 10; index++) {
      voice.emit({ type: 'final_turn', providerTurnId: `turn-${index}`, speaker: index % 2 ? 'candidate' : 'ai', text: `文本 ${index}`, startedAt: index, endedAt: index + 1 });
    }
    await flush();
    expect(voice.connections[0]?.injectedProgress).toHaveLength(1);
    time.advance(5 * 60_000); await flush();
    expect(voice.connections[0]?.injectedProgress).toHaveLength(2);
    voice.emit({ type: 'connection', state: 'disconnected', at: time.now() }); await flush();
    expect(voice.connections[1]?.injectedProgress).toHaveLength(1);
  });

  it('gives custom progress summarizers only the bounded recent final-turn context', async () => {
    const seen: Array<{ speaker: string; text: string; providerTurnId: string }> = [];
    const time = new FakeTime(); const history = new MemoryHistory(); const customVoice = new MemoryRealtimeVoice();
    const session = createInterviewSession({
      clock: time,
      scheduler: time,
      history,
      voice: customVoice,
      snapshot: createContentSnapshot(),
      summarizeProgress: (input) => {
        seen.push(...input.recentTurns);
        return {
          ...input.progress,
          coveredTopics: input.recentTurns.map((turn) => turn.text),
          updatedThroughSequence: input.finalTurnCount,
        };
      },
    });
    await session.start({ microphone: true, camera: true });
    for (let index = 1; index <= 10; index++) {
      await customVoice.emit({ type: 'final_turn', providerTurnId: `bounded-${index}`, speaker: index % 2 ? 'candidate' : 'ai', text: `文本 ${index}`, startedAt: index, endedAt: index + 1 });
    }

    expect(customVoice.connections).toHaveLength(1);
    expect(customVoice.connections[0]?.injectedProgress).toEqual([{
      phase: 'intro',
      coveredTopics: ['文本 3', '文本 4', '文本 5', '文本 6', '文本 7', '文本 8', '文本 9', '文本 10'],
      evidence: [],
      pendingFollowUps: [],
      updatedThroughSequence: 10,
    }]);
    expect(seen.map((turn) => turn.providerTurnId)).toEqual(['bounded-3', 'bounded-4', 'bounded-5', 'bounded-6', 'bounded-7', 'bounded-8', 'bounded-9', 'bounded-10']);
    expect(seen.map((turn) => turn.speaker)).toEqual(['candidate', 'ai', 'candidate', 'ai', 'candidate', 'ai', 'candidate', 'ai']);
    expect(seen[0]?.text).toBe('文本 3');
  });

  it('builds default progress with AI topics, candidate evidence, and follow-ups', async () => {
    const { voice } = await started();
    for (let index = 1; index <= 10; index++) {
      await voice.emit({
        type: 'final_turn',
        providerTurnId: `semantic-${index}`,
        speaker: index === 10 ? 'candidate' : 'ai',
        text: index === 10 ? '我用指标证明了缓存改造的收益' : `AI 话题 ${index}`,
        startedAt: index,
        endedAt: index + 1,
      });
    }

    const progress = voice.connections[0]?.injectedProgress[0];
    expect(progress?.coveredTopics).toContain('AI 话题 9');
    expect(progress?.evidence).toContainEqual({ claim: '我用指标证明了缓存改造的收益', observation: '候选人最终回答', turnIds: ['semantic-10'] });
    expect(progress?.pendingFollowUps).toContain('追问：我用指标证明了缓存改造的收益');
  });

  it('stops new topics at 40:30, enters natural close at 45 minutes, and hard-stops at 47', async () => {
    const { time, history, voice, session } = await started();
    voice.emit({ type: 'final_turn', providerTurnId: 'candidate-before-close', speaker: 'candidate', text: '回答', startedAt: 0, endedAt: 1 }); await flush();
    time.advance(40 * 60_000 + 30_000); await flush();
    expect(session.view().allowNewTopics).toBe(false);
    time.advance(4 * 60_000 + 30_000); await flush();
    expect(session.view().state).toBe('closing');
    time.advance(2 * 60_000); await flush();
    expect(session.view().result).toBe('completed');
    expect(history.finishes[0]).toMatchObject({ result: 'completed', actualDurationMs: 47 * 60_000 });
  });

  it('never reports completed without a candidate final answer, including a hard stop', async () => {
    const { time, session } = await started();
    time.advance(47 * 60_000); await flush();
    expect(session.view().result).toBe('cancelled');
  });

  it('marks a transcript that arrives during closing as missing at the hard stop', async () => {
    const { time, history, voice, session } = await started();
    time.advance(45 * 60_000);
    await flush();
    expect(session.view().state).toBe('closing');
    await voice.emit({ type: 'transcript', state: 'pending', providerTurnId: 'hard-stop-tail', speaker: 'candidate', at: time.now() });
    time.advance(2 * 60_000);
    await flush();

    expect(session.view().result).toBe('cancelled');
    expect(history.finishes[0]).toMatchObject({ completeness: 'missing' });
  });

  it('maps ending before a candidate final answer to cancelled and after one to completed', async () => {
    const first = await started();
    await first.session.end();
    expect(first.session.view().result).toBe('cancelled');
    const second = await started();
    second.voice.emit({ type: 'final_turn', providerTurnId: 'candidate-final', speaker: 'candidate', text: '回答', startedAt: 0, endedAt: 1 }); await flush();
    await second.session.end();
    expect(second.session.view().result).toBe('completed');
  });
});
