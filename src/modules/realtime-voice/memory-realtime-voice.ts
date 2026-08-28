import type { InterviewProgress } from '../interview-content/types';
import type {
  RealtimeConnectInput,
  RealtimeConnection,
  RealtimeVoice,
  VoiceEvent,
} from './port';

export class MemoryRealtimeConnection implements RealtimeConnection {
  readonly injectedProgress: InterviewProgress[] = [];
  cancelAssistantSpeechCount = 0;
  signalEndOfAnswerCount = 0;
  closed = false;

  private listeners = new Set<(event: VoiceEvent) => void | Promise<void>>();
  private closeFailure: Error | null = null;
  private cancelFailure: Error | null = null;
  private injectFailure: Error | null = null;
  private cancelGate: Promise<void> | null = null;

  subscribe(listener: (event: VoiceEvent) => void | Promise<void>) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  rejectClose(error: Error) {
    this.closeFailure = error;
  }

  rejectCancel(error: Error) {
    this.cancelFailure = error;
  }

  rejectInject(error: Error) {
    this.injectFailure = error;
  }

  deferCancel(gate: Promise<void>) {
    this.cancelGate = gate;
  }

  async signalEndOfAnswer() {
    this.signalEndOfAnswerCount++;
  }

  async cancelAssistantSpeech() {
    this.cancelAssistantSpeechCount++;
    await this.cancelGate;
    this.cancelGate = null;
    const failure = this.cancelFailure;
    this.cancelFailure = null;
    if (failure) throw failure;
  }

  async injectProgress(progress: InterviewProgress) {
    this.injectedProgress.push(structuredClone(progress));
    const failure = this.injectFailure;
    this.injectFailure = null;
    if (failure) throw failure;
  }

  async close() {
    this.closed = true;
    const failure = this.closeFailure;
    this.closeFailure = null;
    if (failure) throw failure;
  }

  async emit(event: VoiceEvent) {
    for (const listener of this.listeners) await listener(event);
  }
}

/** Deterministic adapter for tests; its command effects and emitted events are observable state. */
export class MemoryRealtimeVoice implements RealtimeVoice {
  readonly connections: MemoryRealtimeConnection[] = [];
  readonly connectInputs: RealtimeConnectInput[] = [];
  private failures: Error[] = [];
  private deferred: Array<{
    promise: Promise<MemoryRealtimeConnection>;
    resolve: (connection: MemoryRealtimeConnection) => void;
    reject: (error: Error) => void;
  }> = [];

  enqueueConnectFailure(error: Error) {
    this.failures.push(error);
  }

  deferNextConnect() {
    let resolve!: (connection: MemoryRealtimeConnection) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<MemoryRealtimeConnection>((accept, decline) => {
      resolve = accept;
      reject = decline;
    });
    this.deferred.push({ promise, resolve, reject });

    return {
      resolve: () => {
        const connection = new MemoryRealtimeConnection();
        this.connections.push(connection);
        resolve(connection);
        return connection;
      },
      reject,
    };
  }

  async connect(input: RealtimeConnectInput): Promise<MemoryRealtimeConnection> {
    this.connectInputs.push(structuredClone(input));
    const pending = this.deferred.shift();
    if (pending) return pending.promise;
    const failure = this.failures.shift();
    if (failure) throw failure;
    const connection = new MemoryRealtimeConnection();
    this.connections.push(connection);
    return connection;
  }

  async emit(event: VoiceEvent) {
    await this.connections.at(-1)?.emit(event);
  }
}
