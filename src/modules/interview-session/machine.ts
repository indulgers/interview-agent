import { buildRealtimeInstructions } from '../interview-content/instructions';
import { createInitialProgress, phaseAt } from '../interview-content/progress';
import type { InterviewProgress } from '../interview-content/types';
import type { TranscriptCompleteness } from '../interview-history/types';
import type { RealtimeConnection, VoiceEvent } from '../realtime-voice/port';
import type { InterviewSession, InterviewSessionDependencies, InterviewSessionView, SessionState } from './types';

const RESPONSE_HINT_MS = 8_000;
const RESPONSE_RETRY_MS = 15_000;
const RECONNECT_LIMIT_MS = 20_000;
const NEW_TOPIC_CUTOFF_MS = 40 * 60_000 + 30_000;
const SOFT_CLOSE_MS = 45 * 60_000;
const HARD_STOP_MS = 47 * 60_000;

function defaultSummary(input: { progress: InterviewProgress; finalTurnCount: number; phase: InterviewProgress['phase'] }): InterviewProgress {
  return { ...input.progress, phase: input.phase, updatedThroughSequence: input.finalTurnCount };
}

/** Provider- and persistence-neutral deterministic interview orchestration. */
export function createInterviewSession(deps: InterviewSessionDependencies): InterviewSession {
  let state: SessionState = 'ready';
  let result: InterviewSessionView['result'] = null;
  let sessionId: string | null = null;
  let connection: RealtimeConnection | null = null;
  let unsubscribe: (() => void) | null = null;
  let activeSince: number | null = null;
  let activeDuration = 0;
  let finalTurnCount = 0;
  let hasCandidateAnswer = false;
  let hasGap = false;
  let progress = createInitialProgress();
  let responseHint = false;
  let responseRetryUsed = false;
  let allowNewTopics = true;
  let responseHintCancel: (() => void) | null = null;
  let responseRetryCancel: (() => void) | null = null;
  let reconnectCancel: (() => void) | null = null;
  let budgetCancel: (() => void) | null = null;

  const elapsed = () => activeDuration + (activeSince === null ? 0 : deps.clock.now() - activeSince);
  const clear = (cancel: (() => void) | null) => cancel?.();
  const clearResponseTimers = () => { clear(responseHintCancel); clear(responseRetryCancel); responseHintCancel = null; responseRetryCancel = null; responseHint = false; };
  const pauseClock = () => { if (activeSince !== null) { activeDuration += deps.clock.now() - activeSince; activeSince = null; } clear(budgetCancel); budgetCancel = null; };
  const resumeClock = () => { if (activeSince === null && !result) { activeSince = deps.clock.now(); scheduleBudget(); } };

  function view(): InterviewSessionView { return { state, result, activeDurationMs: elapsed(), allowNewTopics, responseHint }; }
  function phase() { return phaseAt(elapsed()); }
  async function injectProgress(): Promise<void> {
    if (!connection) return;
    progress = (deps.summarizeProgress ?? defaultSummary)({ progress, finalTurnCount, phase: phase() });
    await connection.injectProgress(progress);
  }
  function scheduleBudget(): void {
    clear(budgetCancel);
    const now = elapsed();
    const checkpoints = [5 * 60_000, 20 * 60_000, 32 * 60_000, NEW_TOPIC_CUTOFF_MS, 42 * 60_000, SOFT_CLOSE_MS, HARD_STOP_MS];
    const next = checkpoints.find((point) => point > now);
    if (next === undefined) return;
    budgetCancel = deps.scheduler.schedule(() => { void handleBudget(); }, next - now);
  }
  async function handleBudget(): Promise<void> {
    if (result || activeSince === null) return;
    const before = progress.phase;
    const current = elapsed();
    if (current >= NEW_TOPIC_CUTOFF_MS) allowNewTopics = false;
    if (current >= HARD_STOP_MS) { await finish('completed'); return; }
    if (current >= SOFT_CLOSE_MS) state = 'closing';
    const nextPhase = phase();
    scheduleBudget();
    if (nextPhase !== before) await injectProgress();
  }
  async function finish(nextResult: NonNullable<InterviewSessionView['result']>): Promise<void> {
    if (result) return;
    if (nextResult === 'completed' && !hasCandidateAnswer) nextResult = 'cancelled';
    clearResponseTimers(); clear(reconnectCancel); reconnectCancel = null; pauseClock();
    result = nextResult; state = 'finished';
    unsubscribe?.(); unsubscribe = null;
    if (connection) await connection.close();
    if (sessionId) await deps.history.finish(sessionId, nextResult, hasGap ? 'missing' : 'complete' as TranscriptCompleteness, activeDuration);
  }
  async function replaceConnection(): Promise<void> {
    if (result) return;
    try {
      const next = await deps.voice.connect({ instructions: buildRealtimeInstructions(deps.snapshot, progress), resumeFromSequence: finalTurnCount });
      if (result) { await next.close(); return; }
      unsubscribe?.();
      connection = next;
      unsubscribe = connection.subscribe((event) => { void handleEvent(event); });
      clear(reconnectCancel); reconnectCancel = null;
      await injectProgress();
      state = elapsed() >= SOFT_CLOSE_MS ? 'closing' : 'listening';
      resumeClock();
    } catch {
      // The deadline installed by beginReconnect owns terminal failure.
    }
  }
  function beginReconnect(): void {
    if (result || state === 'reconnecting') return;
    clearResponseTimers(); pauseClock(); state = 'reconnecting';
    unsubscribe?.(); unsubscribe = null;
    if (connection) void connection.close();
    clear(reconnectCancel);
    reconnectCancel = deps.scheduler.schedule(() => { void finish('interrupted'); }, RECONNECT_LIMIT_MS);
    void replaceConnection();
  }
  function startResponseTimeout(): void {
    clearResponseTimers();
    responseHintCancel = deps.scheduler.schedule(() => { responseHint = true; }, RESPONSE_HINT_MS);
    responseRetryCancel = deps.scheduler.schedule(() => {
      if (responseRetryUsed) { state = 'paused'; pauseClock(); return; }
      responseRetryUsed = true; beginReconnect();
    }, RESPONSE_RETRY_MS);
  }
  async function handleEvent(event: VoiceEvent): Promise<void> {
    if (result) return;
    switch (event.type) {
      case 'connection': if (event.state === 'disconnected') beginReconnect(); break;
      case 'candidate_speech':
        if (event.state === 'started') { if (state === 'speaking') await connection?.cancelAssistantSpeech(); state = 'listening'; clearResponseTimers(); }
        else startResponseTimeout();
        break;
      case 'assistant_speech':
        clearResponseTimers(); state = event.state === 'started' ? 'speaking' : 'listening'; break;
      case 'response':
        if (event.state === 'started') { clearResponseTimers(); state = 'thinking'; }
        else if (state === 'thinking') state = 'listening';
        break;
      case 'error':
        if (event.category === 'configuration' || event.category === 'unrecoverable') await finish('interrupted'); else beginReconnect();
        break;
      case 'final_turn':
        if (!sessionId) return;
        const outcome = await deps.history.appendFinalTurn({ sessionId, providerTurnId: event.providerTurnId, sequence: finalTurnCount + 1, speaker: event.speaker, text: event.text, startedAt: event.startedAt, endedAt: event.endedAt, hasGap: event.hasGap });
        if (outcome === 'duplicate') return;
        finalTurnCount++; hasCandidateAnswer ||= event.speaker === 'candidate'; hasGap ||= Boolean(event.hasGap);
        if (finalTurnCount % 10 === 0) await injectProgress();
        break;
    }
  }

  return {
    view,
    async start(devices) {
      if (!devices.microphone || !devices.camera) throw new Error('microphone and camera are required');
      if (state !== 'ready') throw new Error('session has already started');
      state = 'connecting';
      const next = await deps.voice.connect({ instructions: buildRealtimeInstructions(deps.snapshot, progress), resumeFromSequence: 0 });
      connection = next;
      sessionId = await deps.history.start({ startedAt: deps.clock.now(), targetDurationMs: SOFT_CLOSE_MS, snapshot: deps.snapshot });
      unsubscribe = connection.subscribe((event) => { void handleEvent(event); });
      state = 'listening'; resumeClock();
    },
    async retry() { if (state === 'paused' || state === 'reconnecting') { state = 'reconnecting'; clear(reconnectCancel); reconnectCancel = deps.scheduler.schedule(() => { void finish('interrupted'); }, RECONNECT_LIMIT_MS); await replaceConnection(); } },
    async signalEndOfAnswer() { await connection?.signalEndOfAnswer(); },
    async end() { await finish(hasCandidateAnswer ? 'completed' : 'cancelled'); },
  };
}
