import { buildRealtimeInstructions } from '../interview-content/instructions';
import { createInitialProgress, phaseAt } from '../interview-content/progress';
import type { InterviewProgress } from '../interview-content/types';
import type { RealtimeConnection, VoiceEvent } from '../realtime-voice/port';
import type {
  InterviewSession,
  InterviewSessionDependencies,
  InterviewSessionView,
  SessionState,
} from './types';

const RECONNECT = 20_000;
const CADENCE = 2_000;
const DRAIN = 5_000;
const CUTOFF = 2_430_000;
const SOFT = 2_700_000;
const HARD = 2_820_000;

type Recent = {
  speaker: 'candidate' | 'ai';
  text: string;
  providerTurnId: string;
};

function defaultSummary(input: {
  progress: InterviewProgress;
  finalTurnCount: number;
  phase: InterviewProgress['phase'];
  recentTurns: Recent[];
}): InterviewProgress {
  const recent = input.recentTurns.slice(-8);
  return {
    ...input.progress,
    phase: input.phase,
    updatedThroughSequence: input.finalTurnCount,
    coveredTopics: recent.map((turn) => turn.text.replace(/\s+/g, ' ').slice(0, 80)),
    evidence: recent
      .filter((turn) => turn.speaker === 'candidate')
      .map((turn) => ({
        claim: turn.text.slice(0, 120),
        observation: '候选人最终回答',
        turnIds: [turn.providerTurnId],
      })),
    pendingFollowUps: recent
      .filter((turn) => turn.speaker === 'candidate')
      .slice(-3)
      .map((turn) => `追问：${turn.text.slice(0, 80)}`),
  };
}

export function createInterviewSession(deps: InterviewSessionDependencies): InterviewSession {
  let state: SessionState = 'ready';
  let result: InterviewSessionView['result'] = null;
  let error: string | null = null;
  let id: string | null = null;
  let connection: RealtimeConnection | null = null;
  let unsubscribe: (() => void) | null = null;

  let activeSince: number | null = null;
  let active = 0;
  let sequence = 0;
  let hasCandidateAnswer = false;
  let hasTranscriptGap = false;
  let finalizing = false;
  let progress = createInitialProgress();
  let responseHint = false;
  let answerSubmission: InterviewSessionView['answerSubmission'] = 'idle';
  let answerSubmissionPromise: Promise<void> | null = null;
  let currentQuestion: string | null = null;
  let allowNewTopics = true;
  let epoch = 0;
  let connectAttempt = 0;

  const pendingTurns = new Set<string>();
  const recent: Recent[] = [];
  const closed = new WeakSet<RealtimeConnection>();

  let reconnectCancellation: (() => void) | null = null;
  let cadenceCancellation: (() => void) | null = null;
  let budgetCancellation: (() => void) | null = null;
  let drainCancellation: (() => void) | null = null;
  let queue = Promise.resolve();
  let running = false;

  const clear = (cancel: (() => void) | null) => cancel?.();
  const elapsed = () => active + (activeSince === null ? 0 : deps.clock.now() - activeSince);
  const phase = () => phaseAt(elapsed());

  const pause = () => {
    if (activeSince !== null) {
      active += deps.clock.now() - activeSince;
      activeSince = null;
    }
    clear(budgetCancellation);
    budgetCancellation = null;
  };

  const enqueue = (work: () => Promise<void>) => {
    const next = running ? queue.then(work, work) : work();
    running = true;
    const tracked = next.catch(() => {
      error = '会话操作失败';
      if (!result) {
        state = 'paused';
        pause();
      }
    });
    queue = tracked;
    void tracked.finally(() => {
      if (queue === tracked) running = false;
    });
    return tracked;
  };

  const clearResponse = () => {
    responseHint = false;
  };

  const view = (): InterviewSessionView => ({
    sessionId: id,
    state,
    result,
    answerSubmission,
    activeDurationMs: elapsed(),
    allowNewTopics,
    responseHint,
    currentQuestion,
    error,
  });

  async function safeClose(target: RealtimeConnection | null) {
    if (!target || closed.has(target)) return;
    closed.add(target);
    try {
      await target.close();
    } catch {
      error = '语音连接关闭失败';
    }
  }

  async function inject() {
    if (!connection) return;
    try {
      progress = (deps.summarizeProgress ?? defaultSummary)({
        progress,
        finalTurnCount: sequence,
        phase: phase(),
        recentTurns: recent.slice(-8),
      });
      await connection.injectProgress(progress);
    } catch {
      error = '进度更新失败，将在下次检查点重试';
    }
  }

  function scheduleBudget() {
    clear(budgetCancellation);
    const next = [300_000, 1_200_000, 1_920_000, CUTOFF, 2_520_000, SOFT, HARD]
      .find((checkpoint) => checkpoint > elapsed());
    budgetCancellation = next === undefined
      ? null
      : deps.scheduler.schedule(() => void enqueue(budget), next - elapsed());
  }

  const resume = () => {
    if (activeSince === null && !result) {
      activeSince = deps.clock.now();
      scheduleBudget();
    }
  };

  async function finalize(wanted: NonNullable<InterviewSessionView['result']>, missing: boolean) {
    if (result || finalizing || !id) return;
    finalizing = true;
    clearResponse();
    clear(reconnectCancellation);
    clear(cadenceCancellation);
    clear(drainCancellation);
    pause();
    epoch++;
    await safeClose(connection);

    const terminal = wanted === 'completed' && !hasCandidateAnswer ? 'cancelled' : wanted;
    try {
      await deps.history.finish(
        id,
        terminal,
        hasTranscriptGap || missing || pendingTurns.size > 0 ? 'missing' : 'complete',
        active,
      );
      result = terminal;
      state = 'finished';
      unsubscribe?.();
      unsubscribe = null;
    } catch {
      finalizing = false;
      error = '保存会话结果失败';
      state = 'paused';
    }
  }

  async function drain(manual = false) {
    state = 'closing';
    if (pendingTurns.size === 0) {
      if (manual) await finalize(hasCandidateAnswer ? 'completed' : 'cancelled', false);
      return;
    }
    clear(drainCancellation);
    drainCancellation = deps.scheduler.schedule(
      () => void enqueue(() => finalize(hasCandidateAnswer ? 'completed' : 'cancelled', true)),
      DRAIN,
    );
  }

  async function budget() {
    if (result || activeSince === null) return;
    const previousPhase = progress.phase;
    const now = elapsed();
    if (now >= CUTOFF) allowNewTopics = false;
    if (now >= HARD) {
      await finalize(hasCandidateAnswer ? 'completed' : 'cancelled', pendingTurns.size > 0);
      return;
    }
    if (now >= SOFT) await drain();
    scheduleBudget();
    if (phase() !== previousPhase) await inject();
  }

  async function attempt(token: number) {
    if (result) return;
    const attemptId = ++connectAttempt;
    try {
      const next = await deps.voice.connect({
        instructions: buildRealtimeInstructions(deps.snapshot, progress),
        resumeFromSequence: sequence,
      });
      if (token !== epoch || result || attemptId !== connectAttempt) {
        await safeClose(next);
        return;
      }

      const previous = connection;
      unsubscribe?.();
      connection = next;
      unsubscribe = next.subscribe((input) => enqueue(async () => {
        if (token === epoch && !result) await onEvent(input);
      }));
      if (previous && previous !== next) await safeClose(previous);
      clear(reconnectCancellation);
      clear(cadenceCancellation);
      await inject();
      state = elapsed() >= SOFT ? 'closing' : 'listening';
      resume();
    } catch {
      if (token === epoch && !result && attemptId === connectAttempt) error = '正在重连语音服务';
    }
  }

  function reconnect(): Promise<void> {
    if (result || state === 'reconnecting') return Promise.resolve();
    clearResponse();
    pause();
    state = 'reconnecting';
    const token = ++epoch;
    unsubscribe?.();
    unsubscribe = null;
    void safeClose(connection);
    clear(reconnectCancellation);
    reconnectCancellation = deps.scheduler.schedule(
      () => void enqueue(() => finalize('interrupted', pendingTurns.size > 0)),
      RECONNECT,
    );

    const tick = () => {
      if (token !== epoch || result) return;
      cadenceCancellation = deps.scheduler.schedule(tick, CADENCE);
      void attempt(token);
    };
    cadenceCancellation = deps.scheduler.schedule(tick, CADENCE);
    return attempt(token);
  }

  async function onEvent(event: VoiceEvent) {
    if (result || finalizing) return;

    switch (event.type) {
      case 'connection':
        if (event.state === 'disconnected') reconnect();
        break;
      case 'transcript':
        pendingTurns.add(event.providerTurnId);
        break;
      case 'candidate_speech':
        if (event.state === 'started') {
          clearResponse();
          if (state === 'speaking') {
            try {
              await connection?.cancelAssistantSpeech();
              if (result || finalizing) return;
              state = 'listening';
            } catch {
              error = '打断失败，可重试';
              state = 'paused';
              pause();
            }
          } else {
            state = 'listening';
          }
        }
        break;
      case 'assistant_speech':
        clearResponse();
        state = event.state === 'started' ? 'speaking' : 'listening';
        break;
      case 'response':
        if (event.state === 'started') {
          clearResponse();
          state = 'thinking';
        } else if (state === 'thinking') {
          state = 'listening';
        }
        break;
      case 'error':
        if (event.category === 'ai_unavailable') reconnect();
        else await finalize('interrupted', pendingTurns.size > 0);
        break;
      case 'final_turn': {
        if (!id) return;
        const inserted = await deps.history.appendFinalTurn({
          sessionId: id,
          providerTurnId: event.providerTurnId,
          sequence: sequence + 1,
          speaker: event.speaker,
          text: event.text,
          startedAt: event.startedAt,
          endedAt: event.endedAt,
          hasGap: event.hasGap,
        });
        if (result || finalizing) return;
        if (inserted === 'inserted') {
          sequence++;
          hasCandidateAnswer ||= event.speaker === 'candidate';
          hasTranscriptGap ||= !!event.hasGap;
          recent.push({
            speaker: event.speaker,
            text: event.text,
            providerTurnId: event.providerTurnId,
          });
          if (event.speaker === 'ai') currentQuestion = event.text;
          pendingTurns.delete(event.providerTurnId);
          if (sequence % 10 === 0) await inject();
        }
        if (state === 'closing' && pendingTurns.size === 0) {
          await finalize(hasCandidateAnswer ? 'completed' : 'cancelled', false);
        }
        break;
      }
    }
  }

  async function end() {
    await enqueue(async () => {
      if (!result) await drain(true);
    });
  }

  return {
    view,
    async start(devices) {
      if (!devices.microphone || !devices.camera) {
        throw new Error('microphone and camera are required');
      }
      if (state !== 'ready') throw new Error('session has already started');

      state = 'connecting';
      const token = ++epoch;
      try {
        const next = await deps.voice.connect({
          instructions: buildRealtimeInstructions(deps.snapshot, progress),
          resumeFromSequence: 0,
        });
        if (token !== epoch) {
          await safeClose(next);
          return;
        }
        connection = next;
        try {
          id = await deps.history.start({
            startedAt: deps.clock.now(),
            targetDurationMs: SOFT,
            snapshot: deps.snapshot,
          });
        } catch (cause) {
          await safeClose(next);
          connection = null;
          state = 'ready';
          throw cause;
        }
        unsubscribe = next.subscribe((event) => enqueue(async () => {
          if (token === epoch && !result && !finalizing) await onEvent(event);
        }));
        state = 'listening';
        resume();
      } catch (cause) {
        if (state === 'connecting') state = 'ready';
        throw cause;
      }
    },
    async retry() {
      await enqueue(async () => {
        if (state !== 'paused') return;
        clearResponse();
        state = 'ready';
        await reconnect();
      });
    },
    signalEndOfAnswer() {
      if (answerSubmissionPromise) return answerSubmissionPromise;
      if (!connection || state !== 'listening') {
        answerSubmission = 'failed';
        return Promise.reject(new Error('语音连接尚未就绪。'));
      }

      answerSubmission = 'submitting';
      const target = connection;
      const token = epoch;
      let submission!: Promise<void>;
      submission = (async () => {
        try {
          await target.submitAnswer();
          if (token === epoch && connection === target && !result && !finalizing) {
            answerSubmission = 'idle';
            if (state === 'listening') state = 'thinking';
          }
        } catch (cause) {
          if (!result && !finalizing) answerSubmission = 'failed';
          throw cause;
        } finally {
          if (answerSubmissionPromise === submission) answerSubmissionPromise = null;
        }
      })();
      answerSubmissionPromise = submission;
      return submission;
    },
    end,
  };
}
