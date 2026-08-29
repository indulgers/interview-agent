import type { InterviewProgress } from '../interview-content/types';
import type { TurnSpeaker } from '../interview-history/types';

export type VoiceEvent =
  | { type: 'connection'; state: 'connected' | 'disconnected'; at: number }
  | { type: 'candidate_speech'; state: 'started' | 'stopped'; at: number }
  | { type: 'assistant_speech'; state: 'started' | 'stopped'; at: number }
  | { type: 'response'; state: 'started' | 'completed'; at: number }
  | { type: 'transcript'; state: 'pending'; providerTurnId: string; speaker: TurnSpeaker; at: number }
  | { type: 'final_turn'; providerTurnId: string; speaker: TurnSpeaker; text: string; startedAt: number; endedAt: number; hasGap?: boolean }
  | { type: 'error'; category: 'ai_unavailable' | 'configuration' | 'unrecoverable'; message: string; at: number };

export interface RealtimeConnectInput { instructions: string; resumeFromSequence: number; }
export interface RealtimeConnection {
  subscribe(listener: (event: VoiceEvent) => void | Promise<void>): () => void;
  submitAnswer(): Promise<void>;
  cancelAssistantSpeech(): Promise<void>;
  injectProgress(progress: InterviewProgress): Promise<void>;
  close(): Promise<void>;
}
export interface RealtimeVoice { connect(input: RealtimeConnectInput): Promise<RealtimeConnection>; }
