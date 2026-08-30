import type { ContentSnapshot, InterviewProgress } from '../interview-content/types';
import type { InterviewHistory, SessionResult } from '../interview-history/types';
import type { RealtimeVoice } from '../realtime-voice/port';

export interface Clock { now(): number; }
export interface Scheduler { schedule(callback: () => void, delayMs: number): () => void; }
export type SessionState = 'ready' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'paused' | 'reconnecting' | 'closing' | 'finished';
export interface DeviceReadiness { microphone: boolean; camera: boolean; }
export interface InterviewSessionView {
  sessionId: string | null;
  state: SessionState;
  result: Exclude<SessionResult, 'in_progress'> | null;
  answerSubmission: 'idle' | 'submitting' | 'failed';
  activeDurationMs: number;
  allowNewTopics: boolean;
  responseHint: boolean;
  currentQuestion: string | null;
  error: string | null;
}
export interface ProgressSummaryInput {
  progress: InterviewProgress;
  finalTurnCount: number;
  phase: InterviewProgress['phase'];
  recentTurns: Array<{ speaker: 'candidate' | 'ai'; text: string; providerTurnId: string }>;
}
export type ProgressSummarizer = (input: ProgressSummaryInput) => InterviewProgress;
export interface InterviewSessionDependencies {
  clock: Clock;
  scheduler: Scheduler;
  history: InterviewHistory;
  voice: RealtimeVoice;
  snapshot: ContentSnapshot;
  summarizeProgress?: ProgressSummarizer;
}
export interface InterviewSession {
  view(): InterviewSessionView;
  start(devices: DeviceReadiness): Promise<void>;
  retry(): Promise<void>;
  signalEndOfAnswer(): Promise<void>;
  end(): Promise<InterviewSessionView>;
}
