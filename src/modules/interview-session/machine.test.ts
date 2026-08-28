import { describe, expect, it } from 'vitest';

import { createContentSnapshot } from '../interview-content/content';
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

async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

async function started() {
  const time = new FakeTime();
  const history = new MemoryHistory();
  const voice = new MemoryRealtimeVoice();
  const session = createInterviewSession({ clock: time, scheduler: time, history, voice, snapshot: createContentSnapshot() });
  await session.start({ microphone: true, camera: true });
  return { time, history, voice, session };
}

describe('InterviewSession', () => {
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
    expect(voice.connections[0]?.cancelAssistantSpeechCount).toBe(1);
  });

  it('returns to listening when a response completes without audio playback', async () => {
    const { voice, session } = await started();
    voice.emit({ type: 'response', state: 'started', at: 1 }); await flush();
    voice.emit({ type: 'response', state: 'completed', at: 2 }); await flush();
    expect(session.view().state).toBe('listening');
  });

  it('shows a response hint at eight seconds and pauses for one automatic retry at fifteen', async () => {
    const { time, voice, session } = await started();
    voice.emit({ type: 'candidate_speech', state: 'stopped', at: 0 }); await flush();
    time.advance(8_000); await flush();
    expect(session.view().responseHint).toBe(true);
    time.advance(7_000); await flush();
    expect(session.view().state).toBe('listening');
    expect(session.view().activeDurationMs).toBe(15_000);
    expect(voice.connections).toHaveLength(2);
  });

  it('leaves a second unanswered response paused for a user retry and keeps end-of-answer as VAD assistance', async () => {
    const { time, voice, session } = await started();
    await session.signalEndOfAnswer();
    expect(voice.connections[0]?.signalEndOfAnswerCount).toBe(1);
    voice.emit({ type: 'candidate_speech', state: 'stopped', at: 0 }); await flush();
    time.advance(15_000); await flush();
    voice.emit({ type: 'candidate_speech', state: 'stopped', at: 15_000 }); await flush();
    time.advance(15_000); await flush();
    expect(session.view().state).toBe('paused');
    await session.retry();
    expect(session.view().state).toBe('listening');
  });

  it('pauses immediately on disconnect, reconnects within 20 seconds, and does not count the pause', async () => {
    const { time, voice, session } = await started();
    time.advance(1_000);
    voice.enqueueConnectFailure(new Error('temporary offline'));
    voice.emit({ type: 'connection', state: 'disconnected', at: 1_000 }); await flush();
    expect(session.view().state).toBe('reconnecting');
    time.advance(10_000); await flush();
    expect(session.view().activeDurationMs).toBe(1_000);
    await session.retry();
    expect(session.view().state).toBe('listening');
    expect(voice.connections[1]?.injectedProgress).toHaveLength(1);
  });

  it('marks an unrecovered connection as interrupted after twenty seconds', async () => {
    const { time, voice, history, session } = await started();
    voice.enqueueConnectFailure(new Error('offline'));
    voice.emit({ type: 'connection', state: 'disconnected', at: 0 }); await flush();
    time.advance(20_000); await flush();
    expect(session.view().result).toBe('interrupted');
    expect(history.finishes[0]).toMatchObject({ result: 'interrupted', actualDurationMs: 0 });
  });

  it('persists each final turn immediately and treats duplicate provider ids as harmless', async () => {
    const { history, voice } = await started();
    const turn = { type: 'final_turn' as const, providerTurnId: 'candidate-1', speaker: 'candidate' as const, text: '我负责了接口设计', startedAt: 2, endedAt: 3 };
    voice.emit(turn); await flush();
    voice.emit(turn); await flush();
    expect(history.turns).toHaveLength(1);
    expect(history.turns[0]).toMatchObject({ sequence: 1, startedAt: 2, endedAt: 3 });
  });

  it('propagates a final-turn transcription gap to terminal history completeness', async () => {
    const { history, voice, session } = await started();
    voice.emit({ type: 'final_turn', providerTurnId: 'partial-candidate', speaker: 'candidate', text: '部分回答', startedAt: 0, endedAt: 1, hasGap: true }); await flush();
    await session.end();
    expect(history.finishes[0]).toMatchObject({ result: 'completed', completeness: 'missing' });
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
