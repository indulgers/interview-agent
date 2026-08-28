import { describe, expect, it } from 'vitest';

import { BailianRealtimeVoice, type BailianBrowserDependencies, type BailianDataChannel, type BailianPeerConnection } from './adapter';

class FakeChannel implements BailianDataChannel {
  constructor(readonly label: string) {}
  readyState: 'connecting' | 'open' | 'closed' = 'open';
  onmessage: ((event: { data: unknown }) => void) | null = null;
  readonly sent: string[] = [];
  closed = false;
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.readyState = 'closed'; }
  emit(payload: unknown) { this.onmessage?.({ data: payload }); }
}

class FakePeer implements BailianPeerConnection {
  iceGatheringState: 'new' | 'gathering' | 'complete' = 'complete';
  connectionState: 'new' | 'connected' | 'failed' | 'closed' = 'new';
  ondatachannel: ((event: { channel: BailianDataChannel }) => void) | null = null;
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  readonly outbound = new FakeChannel('oai-events');
  readonly inbound = new FakeChannel('txt');
  closed = false;
  addTransceiverCalls: string[] = [];
  replacedTrack: FakeTrack | null = null;
  addTransceiver(kind: 'audio') { this.addTransceiverCalls.push(kind); return { sender: { replaceTrack: async (track: FakeTrack | null) => { this.replacedTrack = track; } } }; }
  createDataChannel(label: string) { expect(label).toBe('oai-events'); return this.outbound; }
  async createOffer() { return { type: 'offer' as const, sdp: 'v=0\r\na=offer\r\n' }; }
  async setLocalDescription() {}
  async setRemoteDescription(answer: { type: 'answer'; sdp: string }) { expect(answer).toEqual({ type: 'answer', sdp: 'v=0\r\na=answer\r\n' }); }
  close() { this.closed = true; this.connectionState = 'closed'; }
  deliverInbound() {
    this.ondatachannel?.({ channel: this.inbound });
    this.inbound.emit(JSON.stringify({ type: 'session.created', session: { object: 'realtime.session', model: 'qwen3.5-omni-flash-realtime' } }));
  }
  deliverRemoteAudio(stream: unknown) { this.ontrack?.({ streams: [stream] }); }
}

class FakeTrack {
  enabled = true;
  stopped = false;
  stop() { this.stopped = true; }
}

function setup() {
  const peer = new FakePeer();
  const track = new FakeTrack();
  const audio = { autoplay: false, srcObject: null as unknown, paused: false, pause() { this.paused = true; }, remove() {} };
  const waits: Array<() => void> = [];
  const diagnostics: string[] = [];
  const deps: BailianBrowserDependencies = {
    createPeerConnection: () => peer,
    getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }),
    fetch: async (input, init) => {
      expect(input).toBe('/api/realtime/session');
      expect(init).toEqual({ method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0\r\na=offer\r\n' });
      return { ok: true, text: async () => 'v=0\r\na=answer\r\n' };
    },
    createAudioElement: () => audio,
    now: () => 1_728_000_000_000,
    sleep: () => new Promise<void>((resolve) => waits.push(resolve)),
    onDiagnostic: (eventName) => diagnostics.push(eventName),
  };
  return { peer, track, audio, waits, diagnostics, voice: new BailianRealtimeVoice(deps) };
}

async function readyForPeer(peer: FakePeer) {
  for (let attempt = 0; attempt < 5 && !peer.ondatachannel; attempt++) await Promise.resolve();
}

describe('BailianRealtimeVoice', () => {
  it('negotiates injected WebRTC/media boundaries and sends the documented semantic-VAD session update', async () => {
    const { peer, track, audio, voice } = setup();
    const connected = voice.connect({ instructions: '只问一个技术问题。', resumeFromSequence: 3 });
    await readyForPeer(peer);
    peer.deliverInbound();
    peer.deliverRemoteAudio('remote-audio-stream');
    const connection = await connected;

    expect(peer.addTransceiverCalls).toEqual(['audio']);
    expect(peer.replacedTrack).toBe(track);
    expect(audio.autoplay).toBe(true);
    expect(audio.srcObject).toBe('remote-audio-stream');
    expect(JSON.parse(peer.outbound.sent[0]!)).toMatchObject({
      type: 'session.update',
      session: {
        model: 'qwen3.5-omni-flash-realtime', modalities: ['text', 'audio'], voice: 'Tina', instructions: '只问一个技术问题。',
        input_audio_format: 'pcm', output_audio_format: 'pcm',
        input_audio_transcription: { model: 'qwen3-asr-flash-realtime' },
        turn_detection: { type: 'semantic_vad', threshold: 0.5, silence_duration_ms: 800 },
      },
    });
    await connection.close();
  });

  it('serializes inbound listener delivery and translates validated provider events', async () => {
    const { peer, voice } = setup();
    const pending: Promise<void>[] = [];
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    const seen: string[] = [];
    let release!: () => void;
    connection.subscribe(async (event) => { seen.push(event.type); if (event.type === 'candidate_speech') await new Promise<void>((resolve) => { release = resolve; pending.push(Promise.resolve()); }); });
    peer.inbound.emit(JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'user-1', audio_start_ms: 1 }));
    peer.inbound.emit(JSON.stringify({ type: 'response.created', response: { id: 'response-1', status: 'in_progress' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(['candidate_speech']);
    release(); await Promise.all(pending); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual(['candidate_speech', 'transcript', 'response', 'assistant_speech']);
    await connection.close();
  });

  it('rejects an unexpected inbound channel as diagnostic-only', async () => {
    const { peer, diagnostics, voice } = setup();
    const connecting = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 });
    await readyForPeer(peer);
    const wrongChannel = new FakeChannel('wrong-channel');
    peer.ondatachannel?.({ channel: wrongChannel });
    peer.deliverInbound();
    const connection = await connecting;
    expect(wrongChannel.closed).toBe(true);
    expect(diagnostics).toEqual(['unexpected-data-channel:wrong-channel']);
    await connection.close();
  });

  it('temporarily mutes the local track until VAD reports stopped and clears playback when cancelling', async () => {
    const { peer, track, audio, waits, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound(); peer.deliverRemoteAudio('remote');
    const connection = await connectionPromise;
    const ending = connection.signalEndOfAnswer();
    expect(track.enabled).toBe(false);
    peer.inbound.emit(JSON.stringify({ type: 'input_audio_buffer.speech_stopped', item_id: 'user-1', audio_end_ms: 100 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(track.enabled).toBe(false);
    waits.splice(0).forEach((resolve) => resolve()); await ending;
    expect(track.enabled).toBe(true);
    await connection.cancelAssistantSpeech();
    expect(JSON.parse(peer.outbound.sent.at(-1)!)).toMatchObject({ type: 'response.cancel' });
    expect(audio.paused).toBe(true);
    expect(audio.srcObject).toBeNull();
  });

  it('closes resources once even when called repeatedly', async () => {
    const { peer, track, audio, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    await Promise.all([connection.close(), connection.close()]);
    expect(track.stopped).toBe(true);
    expect(peer.outbound.closed).toBe(true);
    expect(peer.inbound.closed).toBe(true);
    expect(peer.closed).toBe(true);
    expect(audio.paused).toBe(true);
  });
});
