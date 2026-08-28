import type { InterviewProgress } from '../../interview-content/types';
import type { RealtimeConnectInput, RealtimeConnection, RealtimeVoice, VoiceEvent } from '../port';
import { parseBailianEvent } from './events';

const MODEL = 'qwen3.5-omni-flash-realtime';
const ICE_TIMEOUT_MS = 10_000;
const SILENCE_INTERVAL_MS = 800;

export interface BailianDataChannel {
  label: string;
  readyState: 'connecting' | 'open' | 'closed';
  onmessage: ((event: { data: unknown }) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface BailianPeerConnection {
  iceGatheringState: 'new' | 'gathering' | 'complete';
  connectionState: 'new' | 'connected' | 'failed' | 'closed';
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
interface BailianAudioElement { autoplay: boolean; srcObject: unknown; pause?(): void; remove?(): void; }

export interface BailianBrowserDependencies {
  createPeerConnection(): BailianPeerConnection;
  getUserMedia(constraints: { audio: boolean }): Promise<BailianMediaStream>;
  fetch(input: string, init: { method: 'POST'; headers: Record<string, string>; body: string }): Promise<{ ok: boolean; text(): Promise<string> }>;
  createAudioElement(): BailianAudioElement;
  now(): number;
  sleep(milliseconds: number): Promise<void>;
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
      await transceiver.sender.replaceTrack(localTrack);
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
      peer.ontrack = ({ streams }) => { audio!.srcObject = streams[0] ?? null; };
      peer.onconnectionstatechange = () => connection.onConnectionStateChange();

      const offer = await peer.createOffer();
      if (!offer.sdp) throw new Error('Missing SDP offer');
      await peer.setLocalDescription(offer);
      await waitForIce(peer, this.dependencies);
      const response = await this.dependencies.fetch('/api/realtime/session', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp });
      const answer = await response.text();
      if (!response.ok || !isSdp(answer)) throw new Error('Session negotiation failed');
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      await waitForChannel(outbound, this.dependencies);
      connection.sendSessionUpdate(input.instructions);
      return connection;
    } catch {
      inbound?.close(); outbound?.close(); peer?.close(); stream?.getTracks().forEach((track) => track.stop()); audio?.pause?.(); audio?.remove?.();
      throw new Error('实时语音连接不可用。');
    }
  }
}

/** Creates the production browser boundary; tests should inject their own boundaries instead. */
export function createBrowserBailianRealtimeVoice(voice = 'Tina') {
  return new BailianRealtimeVoice({
    createPeerConnection: () => new RTCPeerConnection() as unknown as BailianPeerConnection,
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints) as unknown as Promise<BailianMediaStream>,
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
  private closed = false;
  private answerEnding = false;
  private resolveSpeechStopped: (() => void) | undefined;
  private readonly speechStopped = new Promise<void>((resolve) => { this.resolveSpeechStopped = resolve; });

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
    channel.onmessage = (message) => { this.eventTail = this.eventTail.then(() => this.handleMessage(message.data)).catch(() => this.emit({ type: 'error', category: 'ai_unavailable', message: '实时语音服务暂时不可用。', at: this.dependencies.now() })); };
  }

  onConnectionStateChange() {
    if (this.peer.connectionState === 'failed' || this.peer.connectionState === 'closed') {
      this.resolveSpeechStopped?.();
      this.eventTail = this.eventTail.then(() => this.emit({ type: 'connection', state: 'disconnected', at: this.dependencies.now() }));
    }
  }

  sendSessionUpdate(instructions: string) {
    this.send({
      event_id: eventId(this.dependencies.now()), type: 'session.update', session: {
        model: MODEL, modalities: ['text', 'audio'], voice: this.voice,
        audio: { input: { format: { type: 'pcm', sample_rate: 16000 } }, output: { format: { type: 'pcm', sample_rate: 24000 } } },
        instructions, turn_detection: { type: 'semantic_vad', threshold: 0.5, silence_duration_ms: 800 },
      },
    });
  }

  async signalEndOfAnswer() {
    if (this.closed || this.answerEnding || !this.localTrack.enabled) return;
    this.answerEnding = true;
    this.localTrack.enabled = false;
    await Promise.all([this.speechStopped, this.dependencies.sleep(SILENCE_INTERVAL_MS)]);
    if (!this.closed) this.localTrack.enabled = true;
    this.answerEnding = false;
  }

  async cancelAssistantSpeech() {
    if (this.closed) return;
    this.send({ event_id: eventId(this.dependencies.now()), type: 'response.cancel' });
    this.audio.pause?.();
    this.audio.srcObject = null;
  }

  async injectProgress(progress: InterviewProgress) {
    if (this.closed) return;
    this.sendSessionUpdate(`${this.baseInstructions}\n\n当前面试进度（只作内部上下文）：${JSON.stringify(progress)}`);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.resolveSpeechStopped?.();
    this.inbound?.close(); this.outbound.close(); this.stream.getTracks().forEach((track) => track.stop());
    this.audio.pause?.(); this.audio.srcObject = null; this.audio.remove?.(); this.peer.close();
    await this.eventTail;
  }

  private async handleMessage(data: unknown) {
    const text = await messageText(data);
    if (text === null) { this.dependencies.onDiagnostic?.('non-text-txt-event'); return; }
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { this.dependencies.onDiagnostic?.('malformed-txt-event'); return; }
    if (isObject(payload) && payload.type === 'input_audio_buffer.speech_stopped') this.resolveSpeechStopped?.();
    const events = parseBailianEvent(payload, this.dependencies.now());
    if (events.length === 0) this.dependencies.onDiagnostic?.(isObject(payload) && typeof payload.type === 'string' ? `unknown-event:${payload.type}` : 'malformed-provider-event');
    for (const event of events) await this.emit(event);
  }

  private async emit(event: VoiceEvent) { for (const listener of this.listeners) await listener(event); }

  private send(payload: object) {
    if (this.outbound.readyState !== 'open') throw new Error('Outbound data channel is not open');
    this.outbound.send(JSON.stringify(payload));
  }
}

function eventId(now: number) { return `event_${now}_${Math.random().toString(36).slice(2)}`; }
function isSdp(value: string) { return /^v=0(?:\r?\n|$)/.test(value); }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
async function messageText(data: unknown): Promise<string | null> {
  if (typeof data === 'string') return data;
  if (isObject(data) && typeof data.text === 'function') return data.text() as Promise<string>;
  return null;
}
async function waitForChannel(channel: BailianDataChannel, dependencies: BailianBrowserDependencies) {
  const deadline = dependencies.now() + ICE_TIMEOUT_MS;
  while (channel.readyState === 'connecting' && dependencies.now() < deadline) await dependencies.sleep(25);
  if (channel.readyState !== 'open') throw new Error('Data channel did not open');
}
async function waitForIce(peer: BailianPeerConnection, dependencies: BailianBrowserDependencies) {
  const deadline = dependencies.now() + ICE_TIMEOUT_MS;
  while (peer.iceGatheringState !== 'complete' && dependencies.now() < deadline) await dependencies.sleep(25);
  if (peer.iceGatheringState !== 'complete') throw new Error('ICE gathering timed out');
}
