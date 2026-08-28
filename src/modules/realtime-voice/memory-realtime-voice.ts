import type { InterviewProgress } from '../interview-content/types';
import type { RealtimeConnectInput, RealtimeConnection, RealtimeVoice, VoiceEvent } from './port';

export class MemoryRealtimeConnection implements RealtimeConnection {
  readonly injectedProgress: InterviewProgress[] = [];
  cancelAssistantSpeechCount = 0;
  signalEndOfAnswerCount = 0;
  closed = false;
  private listeners = new Set<(event: VoiceEvent) => void>();
  subscribe(listener: (event: VoiceEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  async signalEndOfAnswer() { this.signalEndOfAnswerCount++; }
  async cancelAssistantSpeech() { this.cancelAssistantSpeechCount++; }
  async injectProgress(progress: InterviewProgress) { this.injectedProgress.push(structuredClone(progress)); }
  async close() { this.closed = true; }
  emit(event: VoiceEvent) { for (const listener of this.listeners) listener(event); }
}

/** Deterministic adapter for tests; its command effects and emitted events are observable state. */
export class MemoryRealtimeVoice implements RealtimeVoice {
  readonly connections: MemoryRealtimeConnection[] = [];
  readonly connectInputs: RealtimeConnectInput[] = [];
  private failures: Error[] = [];
  enqueueConnectFailure(error: Error) { this.failures.push(error); }
  async connect(input: RealtimeConnectInput): Promise<MemoryRealtimeConnection> {
    this.connectInputs.push(structuredClone(input));
    const failure = this.failures.shift();
    if (failure) throw failure;
    const connection = new MemoryRealtimeConnection(); this.connections.push(connection); return connection;
  }
  emit(event: VoiceEvent) { this.connections.at(-1)?.emit(event); }
}
