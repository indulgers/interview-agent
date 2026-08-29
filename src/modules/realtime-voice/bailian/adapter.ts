import type { InterviewProgress } from '../../interview-content/types';
import type { RealtimeConnectInput, RealtimeConnection, RealtimeVoice, VoiceEvent } from '../port';
import { createBailianTiming, parseBailianEvent } from './events';

const MODEL = 'qwen3.5-omni-flash-realtime';
const ICE_TIMEOUT_MS = 10_000;

export interface BailianDataChannel {
  label: string;
  readyState: 'connecting' | 'open' | 'closed';
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface BailianPeerConnection {
  iceGatheringState: 'new' | 'gathering' | 'complete';
  connectionState: 'new' | 'connected' | 'disconnected' | 'failed' | 'closed';
  ondatachannel: ((event: { channel: BailianDataChannel }) => void) | null;
  ontrack: ((event: { streams: unknown[] }) => void) | null;
  onconnectionstatechange?: (() => void) | null;
  addTransceiver(kind: 'audio', init: { direction: 'sendrecv' }): { sender: { replaceTrack(track: BailianMediaTrack | null): Promise<void> } };
  createDataChannel(label: string): BailianDataChannel;
  createOffer(): Promise<{ type: 'offer'; sdp?: string }>;
  setLocalDescription(description: { type: 'offer'; sdp?: string }): Promise<void>;
  setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  close(): void;
}

export interface BailianMediaTrack { enabled: boolean; stop(): void; }
interface BailianMediaStream { getAudioTracks(): BailianMediaTrack[]; getTracks(): BailianMediaTrack[]; }
interface BailianAudioElement { autoplay: boolean; srcObject: unknown; play?(): Promise<void>; pause?(): void; remove?(): void; }

export interface BailianBrowserDependencies {
  createPeerConnection(): BailianPeerConnection;
  getUserMedia(constraints: { audio: boolean }): Promise<BailianMediaStream>;
  fetch(input: string, init: { method: 'POST'; headers: Record<string, string>; body: string; signal?: AbortSignal }): Promise<{ ok: boolean; text(): Promise<string> }>;
  createAudioElement(): BailianAudioElement;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
  scheduleTimeout?(callback: () => void, milliseconds: number): unknown;
  cancelTimeout?(handle: unknown): void;
  timeoutMs?: number;
  onDiagnostic?(eventName: string): void;
}

export class BailianRealtimeVoice implements RealtimeVoice {
  constructor(private readonly dependencies: BailianBrowserDependencies, private readonly voice = 'Tina') {}

  async connect(input: RealtimeConnectInput): Promise<RealtimeConnection> {
    let peer: BailianPeerConnection | undefined;
    let stream: BailianMediaStream | undefined;
    let outbound: BailianDataChannel | undefined;
    let inbound: BailianDataChannel | undefined;
    let audio: BailianAudioElement | undefined;

    try {
      stream = await this.dependencies.getUserMedia({ audio: true });
      const localTrack = stream.getAudioTracks()[0];
      if (!localTrack) throw new Error('No local audio track');
      peer = this.dependencies.createPeerConnection();
      const transceiver = peer.addTransceiver('audio', { direction: 'sendrecv' });
      localTrack.enabled = false;
      await transceiver.sender.replaceTrack(null);
      outbound = peer.createDataChannel('oai-events');
      if (outbound.label !== 'oai-events') throw new Error('Unexpected outbound data channel');
      audio = this.dependencies.createAudioElement();
      audio.autoplay = true;
      const connection = new BailianRealtimeConnection(this.dependencies, peer, stream, localTrack, outbound, audio, input.instructions, this.voice);
      peer.ondatachannel = ({ channel }) => {
        if (channel.label !== 'txt') {
          this.dependencies.onDiagnostic?.(`unexpected-data-channel:${channel.label}`);
          channel.close();
          return;
        }
        if (inbound) {
          this.dependencies.onDiagnostic?.('duplicate-txt-data-channel');
          channel.close();
          return;
        }
        inbound = channel;
        connection.setInboundChannel(channel);
      };
      peer.ontrack = ({ streams }) => { connection.attachRemoteAudio(streams[0] ?? null); };
      peer.onconnectionstatechange = () => connection.onConnectionStateChange();

      const offer = await peer.createOffer();
      if (!offer.sdp) throw new Error('Missing SDP offer');
      const offerSdp = offer.sdp;
      await peer.setLocalDescription(offer);
      await waitForIce(peer, this.dependencies);
      const { response, answer } = await withBrowserTimeout(async (signal) => {
        const response = await this.dependencies.fetch('/api/realtime/session', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offerSdp, signal });
        return { response, answer: await response.text() };
      }, this.dependencies);
      if (!response.ok || !isSdp(answer)) throw new Error('Session negotiation failed');
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      await waitForChannel(outbound, this.dependencies);
      await connection.waitUntilConfigured();
      connection.sendSessionUpdate(input.instructions);
      await transceiver.sender.replaceTrack(localTrack);
      localTrack.enabled = true;
      return connection;
    } catch {
      inbound?.close(); outbound?.close(); peer?.close(); stream?.getTracks().forEach((track) => track.stop()); audio?.pause?.(); audio?.remove?.();
      throw new Error('实时语音连接不可用。');
    }
  }
}

/** Creates the production browser boundary; tests should inject their own boundaries instead. */
export function createBrowserBailianRealtimeVoice(voice = 'Tina', mediaStream?: MediaStream) {
  return new BailianRealtimeVoice({
    createPeerConnection: () => new RTCPeerConnection() as unknown as BailianPeerConnection,
    getUserMedia: (constraints) => mediaStream
      ? Promise.resolve(mediaStream as unknown as BailianMediaStream)
      : navigator.mediaDevices.getUserMedia(constraints) as unknown as Promise<BailianMediaStream>,
    fetch: async (input, init) => window.fetch(input, init),
    createAudioElement: () => {
      const audio = document.createElement('audio');
      audio.autoplay = true;
      document.body.append(audio);
      return audio;
    },
    now: () => Date.now(),
    sleep: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
  }, voice);
}

class BailianRealtimeConnection implements RealtimeConnection {
  private readonly listeners = new Set<(event: VoiceEvent) => void | Promise<void>>();
  private eventTail = Promise.resolve();
  private inbound: BailianDataChannel | undefined;
  private unavailable = false;
  private resourcesReleased = false;
  private answerSubmissionPromise: Promise<void> | undefined;
  private awaitingResponse = false;
  private readyResolve!: () => void;
  private readonly configured = new Promise<void>((resolve) => { this.readyResolve = resolve; });
  private sessionCreated = false;
  private readonly eventTiming = createBailianTiming();

  constructor(
    private readonly dependencies: BailianBrowserDependencies,
    private readonly peer: BailianPeerConnection,
    private readonly stream: BailianMediaStream,
    private readonly localTrack: BailianMediaTrack,
    private readonly outbound: BailianDataChannel,
    private readonly audio: BailianAudioElement,
    private readonly baseInstructions: string,
    private readonly voice: string,
  ) {}

  subscribe(listener: (event: VoiceEvent) => void | Promise<void>) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  setInboundChannel(channel: BailianDataChannel) {
    this.inbound = channel;
    channel.onmessage = (message) => { this.enqueue(() => this.handleMessage(message.data)); };
  }

  async waitUntilConfigured() {
    await withBrowserTimeout(() => this.configured, this.dependencies);
  }

  attachRemoteAudio(stream: unknown) {
    this.audio.srcObject = stream;
    this.enqueue(async () => {
      if (this.unavailable) return;
      try { if (this.audio.play) await this.audio.play(); } catch {
        if (this.unavailable) return;
        this.diagnostic('remote-audio-playback-failed');
        await this.emitSafely({ type: 'error', category: 'ai_unavailable', message: '远端音频播放不可用。', at: this.dependencies.now() });
      }
    });
  }

  onConnectionStateChange() {
    if (!['disconnected', 'failed', 'closed'].includes(this.peer.connectionState) || this.unavailable) return;
    this.unavailable = true;
    this.eventTail = this.eventTail.then(() => this.emitSafely({ type: 'connection', state: 'disconnected', at: this.dependencies.now() })).catch(() => { this.diagnostic('provider-event-handler-failed'); });
    this.releaseResources();
  }

  sendSessionUpdate(instructions: string) {
    this.send({
      event_id: eventId(this.dependencies.now()), type: 'session.update', session: {
        model: MODEL, modalities: ['text', 'audio'], voice: this.voice,
        input_audio_format: 'pcm', output_audio_format: 'pcm',
        input_audio_transcription: { model: 'qwen3-asr-flash-realtime' },
        instructions, turn_detection: null,
      },
    });
  }

  submitAnswer() {
    if (this.unavailable) return Promise.reject(connectionUnavailable());
    if (this.answerSubmissionPromise) return this.answerSubmissionPromise;
    const submission = this.submitCurrentAnswer();
    this.answerSubmissionPromise = submission;
    void submission.then(
      () => { if (this.answerSubmissionPromise === submission) this.answerSubmissionPromise = undefined; },
      () => { if (this.answerSubmissionPromise === submission) this.answerSubmissionPromise = undefined; },
    );
    return submission;
  }

  private async submitCurrentAnswer() {
    await this.eventTail;
    if (this.unavailable) throw connectionUnavailable();
    this.localTrack.enabled = false;
    try {
      this.send({ event_id: eventId(this.dependencies.now()), type: 'input_audio_buffer.commit' });
      this.send({ event_id: eventId(this.dependencies.now()), type: 'response.create' });
      this.awaitingResponse = true;
    } catch (cause) {
      this.localTrack.enabled = true;
      throw cause;
    }
  }

  async cancelAssistantSpeech() {
    if (this.unavailable) throw connectionUnavailable();
    this.send({ event_id: eventId(this.dependencies.now()), type: 'response.cancel' });
    this.audio.pause?.();
    this.audio.srcObject = null;
  }

  async injectProgress(progress: InterviewProgress) {
    if (this.unavailable) throw connectionUnavailable();
    this.sendSessionUpdate(`${this.baseInstructions}\n\n当前面试进度（只作内部上下文）：${JSON.stringify(progress)}`);
  }

  async close() {
    if (this.resourcesReleased) { await this.eventTail; return; }
    this.unavailable = true;
    this.releaseResources();
    await this.eventTail;
  }

  private releaseResources() {
    if (this.resourcesReleased) return;
    this.resourcesReleased = true;
    this.localTrack.enabled = true;
    this.inbound?.close(); this.outbound.close(); this.stream.getTracks().forEach((track) => track.stop());
    this.audio.pause?.(); this.audio.srcObject = null; this.audio.remove?.(); this.peer.close();
  }

  private async handleMessage(data: unknown) {
    if (this.unavailable) return;
    const text = await messageText(data);
    if (text === null) { this.diagnostic('non-text-txt-event'); return; }
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { this.diagnostic('malformed-txt-event'); return; }
    if (isObject(payload) && payload.type === 'session.created') { this.sessionCreated = true; if (this.inbound) this.readyResolve(); }
    const events = parseBailianEvent(payload, this.dependencies.now(), this.eventTiming);
    if (events.length === 0) this.diagnostic(isObject(payload) && typeof payload.type === 'string' ? `unknown-event:${payload.type}` : 'malformed-provider-event');
    for (const event of events) await this.emitSafely(event);
    if (isObject(payload) && (payload.type === 'response.done' || payload.type === 'error') && this.awaitingResponse) {
      this.awaitingResponse = false;
      this.localTrack.enabled = true;
    }
  }

  private async emitSafely(event: VoiceEvent) {
    for (const listener of this.listeners) {
      try { await listener(event); } catch { this.diagnostic('voice-listener-failed'); }
    }
  }

  private send(payload: object) {
    if (this.unavailable || this.outbound.readyState !== 'open') throw connectionUnavailable();
    this.outbound.send(JSON.stringify(payload));
  }

  private enqueue(operation: () => Promise<void>) {
    this.eventTail = this.eventTail.then(operation).catch(() => { this.diagnostic('provider-event-handler-failed'); });
  }

  private diagnostic(eventName: string) {
    try { this.dependencies.onDiagnostic?.(eventName); } catch { /* diagnostics must never break event delivery */ }
  }
}

function eventId(now: number) { return `event_${now}_${Math.random().toString(36).slice(2)}`; }
function connectionUnavailable() { return new Error('实时语音连接已断开。'); }
function isSdp(value: string) { return /^v=0(?:\r?\n|$)/.test(value); }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
async function messageText(data: unknown): Promise<string | null> {
  if (typeof data === 'string') return data;
  if (isObject(data) && typeof data.text === 'function') return data.text() as Promise<string>;
  return null;
}
async function waitForChannel(channel: BailianDataChannel, dependencies: BailianBrowserDependencies) {
  await withBrowserTimeout(async () => {
    while (channel.readyState === 'connecting') await dependencies.sleep(25);
    if (channel.readyState !== 'open') throw new Error('Data channel did not open');
  }, dependencies);
}
async function waitForIce(peer: BailianPeerConnection, dependencies: BailianBrowserDependencies) {
  await withBrowserTimeout(async () => {
    while (peer.iceGatheringState !== 'complete') await dependencies.sleep(25);
  }, dependencies);
}
async function withBrowserTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, dependencies: BailianBrowserDependencies) {
  const controller = new AbortController();
  let timeoutHandle: unknown;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = (dependencies.scheduleTimeout ?? ((callback, milliseconds) => window.setTimeout(callback, milliseconds)))(() => { controller.abort(); reject(new Error('timeout')); }, dependencies.timeoutMs ?? ICE_TIMEOUT_MS);
  });
  try { return await Promise.race([operation(controller.signal), timeout]); }
  finally { if (timeoutHandle !== undefined) (dependencies.cancelTimeout ?? ((handle) => window.clearTimeout(handle as number)))(timeoutHandle); }
}
