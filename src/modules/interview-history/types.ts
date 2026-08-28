import type { ContentSnapshot } from '../interview-content/types';

export type SessionId = string;
export type DateLike = Date | number;
export type SessionResult = 'in_progress' | 'completed' | 'interrupted' | 'cancelled';
export type TranscriptCompleteness = 'complete' | 'missing';
export type FeedbackStatus = 'pending' | 'generating' | 'completed' | 'failed' | 'not_applicable';
export type TurnSpeaker = 'candidate' | 'ai';

export interface StartSession {
  /** A caller may provide an id for replayable integration tests; production normally omits it. */
  id?: SessionId;
  startedAt: DateLike;
  targetDurationMs: number;
  snapshot: ContentSnapshot;
}

export interface FinalTurn {
  sessionId: SessionId;
  providerTurnId: string;
  sequence: number;
  speaker: TurnSpeaker;
  text: string;
  startedAt: DateLike;
  endedAt: DateLike;
  hasGap?: boolean;
}

export interface FeedbackUpdate {
  status: FeedbackStatus;
  failureType?: string;
  result?: unknown;
  generatedAt?: DateLike;
}

export interface SessionSummary {
  id: SessionId;
  startedAt: Date;
  endedAt: Date | null;
  targetDurationMs: number;
  actualDurationMs: number | null;
  result: SessionResult;
  completeness: TranscriptCompleteness;
  feedbackStatus: FeedbackStatus;
  hasTranscriptGap: boolean;
}

export interface TranscriptTurn {
  id: string;
  providerTurnId: string;
  sequence: number;
  speaker: 'candidate' | 'ai';
  text: string;
  startedAt: Date | null;
  endedAt: Date | null;
  hasGap: boolean;
}

export interface FeedbackRecord {
  status: FeedbackStatus;
  failureType: string | null;
  result: unknown | null;
  generatedAt: Date | null;
}

export interface SessionDetail {
  session: SessionSummary;
  snapshot: ContentSnapshot;
  turns: TranscriptTurn[];
  feedback: FeedbackRecord | null;
}

export interface InterviewHistory {
  start(input: StartSession): Promise<SessionId>;
  appendFinalTurn(input: FinalTurn): Promise<'inserted' | 'duplicate'>;
  finish(id: SessionId, result: Exclude<SessionResult, 'in_progress'>, completeness: TranscriptCompleteness, actualDurationMs: number): Promise<void>;
  setFeedback(id: SessionId, update: FeedbackUpdate): Promise<void>;
  list(): Promise<SessionSummary[]>;
  detail(id: SessionId): Promise<SessionDetail | null>;
  delete(id: SessionId): Promise<void>;
  recoverAbandoned(): Promise<number>;
}
