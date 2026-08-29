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
  connectionState: 'new' | 'connected' | 'disconnected' | 'failed' | 'closed' = 'new';
  ondatachannel: ((event: { channel: BailianDataChannel }) => void) | null = null;
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
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
    this.deliverInboundChannel();
    this.inbound.emit(JSON.stringify({ type: 'session.created', session: { object: 'realtime.session', model: 'qwen3.5-omni-flash-realtime' } }));
  }
  deliverInboundChannel() { this.ondatachannel?.({ channel: this.inbound }); }
  deliverRemoteAudio(stream: unknown) { this.ontrack?.({ streams: [stream] }); }
}

class FakeTrack {
  enabled = true;
  stopped = false;
  stop() { this.stopped = true; }
}

function setup(options: { fetch?: BailianBrowserDependencies['fetch']; play?: () => Promise<void>; iceGatheringState?: FakePeer['iceGatheringState']; now?: () => number; sleep?: (milliseconds: number) => Promise<void> } = {}) {
  const peer = new FakePeer();
  if (options.iceGatheringState) peer.iceGatheringState = options.iceGatheringState;
  const track = new FakeTrack();
  const audio = { autoplay: false, srcObject: null as unknown, paused: false, play: options.play, pause() { this.paused = true; }, remove() {} };
  const waits: Array<() => void> = [];
  const diagnostics: string[] = [];
  const deps: BailianBrowserDependencies = {
    createPeerConnection: () => peer,
    getUserMedia: async () => ({ getAudioTracks: () => [track], getTracks: () => [track] }),
    fetch: options.fetch ?? (async (input, init) => {
      expect(input).toBe('/api/realtime/session');
      expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: 'v=0\r\na=offer\r\n' });
      return { ok: true, text: async () => 'v=0\r\na=answer\r\n' };
    }),
    createAudioElement: () => audio,
    now: options.now ?? (() => 1_728_000_000_000),
    sleep: options.sleep ?? (() => new Promise<void>((resolve) => waits.push(resolve))),
    scheduleTimeout: (callback) => { waits.push(callback); return callback; },
    cancelTimeout: (handle) => {
      const index = waits.indexOf(handle as () => void);
      if (index >= 0) waits.splice(index, 1);
    },
    onDiagnostic: (eventName) => diagnostics.push(eventName),
  };
  return { peer, track, audio, waits, diagnostics, voice: new BailianRealtimeVoice(deps) };
}

async function expirePendingSleeps(waits: Array<() => void>, complete: () => boolean) {
  for (let attempt = 0; attempt < 12 && !complete(); attempt++) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    waits.splice(0).forEach((resolve) => resolve());
  }
}

async function readyForPeer(peer: FakePeer) {
  for (let attempt = 0; attempt < 5 && !peer.ondatachannel; attempt++) await Promise.resolve();
}

describe('BailianRealtimeVoice', () => {
  it('negotiates injected WebRTC/media boundaries and configures manual answer submission', async () => {
    const { peer, track, audio, waits, voice } = setup();
    const connected = voice.connect({ instructions: '只问一个技术问题。', resumeFromSequence: 3 });
    await readyForPeer(peer);
    peer.deliverInbound();
    peer.deliverRemoteAudio('remote-audio-stream');
    const connection = await connected;

    expect(peer.addTransceiverCalls).toEqual(['audio']);
    expect(peer.replacedTrack).toBe(track);
    expect(audio.autoplay).toBe(true);
    expect(audio.srcObject).toBe('remote-audio-stream');
    expect(waits).toEqual([]);
    expect(JSON.parse(peer.outbound.sent[0]!)).toMatchObject({
      type: 'session.update',
      session: {
        model: 'qwen3.5-omni-flash-realtime', modalities: ['text', 'audio'], voice: 'Tina', instructions: '只问一个技术问题。',
        input_audio_format: 'pcm', output_audio_format: 'pcm',
        input_audio_transcription: { model: 'qwen3-asr-flash-realtime' },
        turn_detection: null,
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

  it('submits an answer with ordered provider commands and keeps the local track muted until response completion', async () => {
    const { peer, track, audio, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound(); peer.deliverRemoteAudio('remote');
    const connection = await connectionPromise;
    const submission = connection.submitAnswer();
    await Promise.resolve();
    expect(track.enabled).toBe(false);
    expect(peer.outbound.sent.slice(-2).map((value) => JSON.parse(value).type)).toEqual([
      'input_audio_buffer.commit',
      'response.create',
    ]);
    await submission;
    expect(track.enabled).toBe(false);
    peer.inbound.emit(JSON.stringify({ type: 'response.done', response: { id: 'response-1', status: 'completed' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(track.enabled).toBe(true);
    await connection.cancelAssistantSpeech();
    expect(JSON.parse(peer.outbound.sent.at(-1)!)).toMatchObject({ type: 'response.cancel' });
    expect(audio.paused).toBe(true);
    expect(audio.srcObject).toBeNull();
  });

  it('shares concurrent answer submissions and sends one provider command pair', async () => {
    const { peer, track, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    const first = connection.submitAnswer();
    const concurrent = connection.submitAnswer();
    expect(concurrent).toBe(first);
    await Promise.resolve();
    expect(track.enabled).toBe(false);
    expect(peer.outbound.sent.slice(-2).map((value) => JSON.parse(value).type)).toEqual([
      'input_audio_buffer.commit',
      'response.create',
    ]);
    let settled = false;
    void first.then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(true);
    expect(track.enabled).toBe(false);
    peer.inbound.emit(JSON.stringify({ type: 'response.done', response: { id: 'response-1', status: 'completed' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(track.enabled).toBe(true);
    await connection.close();
  });

  it('restores a muted track when the connection closes before a submitted response completes', async () => {
    const { peer, track, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    await connection.submitAnswer();
    expect(track.enabled).toBe(false);
    await connection.close();
    expect(track.enabled).toBe(true);
  });

  it('restores a muted track when a submitted response fails', async () => {
    const { peer, track, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    await connection.submitAnswer();
    expect(track.enabled).toBe(false);

    peer.inbound.emit(JSON.stringify({ type: 'error', error: { type: 'server_error', code: 'response_failed', message: 'provider detail' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(track.enabled).toBe(true);
    await connection.close();
  });

  it('keeps candidate VAD events observable without automatically requesting a response', async () => {
    const { peer, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    const seen: string[] = [];
    connection.subscribe((event) => { seen.push(event.type === 'candidate_speech' ? `${event.type}:${event.state}` : event.type); });
    peer.inbound.emit(JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'user-1', audio_start_ms: 10 }));
    peer.inbound.emit(JSON.stringify({ type: 'input_audio_buffer.speech_stopped', item_id: 'user-1', audio_end_ms: 100 }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(seen).toEqual(['candidate_speech:started', 'transcript', 'candidate_speech:stopped']);
    expect(peer.outbound.sent.map((value) => JSON.parse(value).type)).not.toContain('response.create');
    await connection.close();
  });

  it('reports rejected remote audio playback and still delivers later provider events', async () => {
    const { peer, diagnostics, voice } = setup({ play: async () => { throw new Error('autoplay denied'); } });
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    const seen: string[] = [];
    connection.subscribe((event) => { seen.push(event.type); });
    peer.deliverRemoteAudio('remote');
    await new Promise((resolve) => setTimeout(resolve, 0));
    peer.inbound.emit(JSON.stringify({ type: 'response.created', response: { id: 'response-1', status: 'in_progress' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(diagnostics).toContain('remote-audio-playback-failed');
    expect(seen).toEqual(['error', 'response', 'assistant_speech']);
    await connection.close();
  });

  it('queues a playback rejection between provider events and suppresses it after close', async () => {
    let rejectPlay!: (error: Error) => void;
    const { peer, diagnostics, voice } = setup({ play: () => new Promise<void>((_resolve, reject) => { rejectPlay = reject; }) });
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    const delivered: string[] = [];
    connection.subscribe(async () => { throw new Error('listener failure'); });
    connection.subscribe((event) => { delivered.push(event.type); });

    peer.inbound.emit(JSON.stringify({ type: 'response.created', response: { id: 'response-1', status: 'in_progress' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    peer.deliverRemoteAudio('remote');
    await Promise.resolve();
    rejectPlay(new Error('autoplay denied'));
    peer.inbound.emit(JSON.stringify({ type: 'response.done', response: { id: 'response-1', status: 'completed' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(delivered).toEqual(['response', 'assistant_speech', 'error', 'assistant_speech', 'response']);
    expect(diagnostics.filter((event) => event === 'voice-listener-failed')).toHaveLength(5);

    const deliveredBeforeClose = [...delivered];
    peer.deliverRemoteAudio('remote-after-close');
    await Promise.resolve();
    const closing = connection.close();
    rejectPlay(new Error('late autoplay denial'));
    await closing;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toEqual(deliveredBeforeClose);
  });

  it('isolates throwing and rejecting subscribers so the event queue continues', async () => {
    const { peer, diagnostics, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    const delivered: string[] = [];
    connection.subscribe(async () => { throw new Error('listener failure'); });
    connection.subscribe((event) => { delivered.push(event.type); });
    peer.inbound.emit(JSON.stringify({ type: 'response.created', response: { id: 'response-1', status: 'in_progress' } }));
    peer.inbound.emit(JSON.stringify({ type: 'response.done', response: { id: 'response-1', status: 'completed' } }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(delivered).toEqual(['response', 'assistant_speech', 'assistant_speech', 'response']);
    expect(diagnostics.filter((event) => event === 'voice-listener-failed')).toHaveLength(4);
    await connection.close();
  });

  it('aborts an SDP fetch timeout and releases every negotiated resource', async () => {
    let signal: AbortSignal | undefined;
    const { peer, track, audio, waits, voice } = setup({ fetch: async (_input, init) => {
      signal = init.signal;
      return new Promise(() => {});
    } });
    const connecting = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 });
    await readyForPeer(peer);
    for (let attempt = 0; attempt < 10 && !signal; attempt++) {
      await Promise.resolve();
      waits.splice(0).forEach((resolve) => resolve());
    }
    await expect(connecting).rejects.toThrow('实时语音连接不可用。');
    expect(signal?.aborted).toBe(true);
    expect(track.stopped).toBe(true);
    expect(peer.outbound.closed).toBe(true);
    expect(peer.closed).toBe(true);
    expect(audio.paused).toBe(true);
  });

  it('keeps the SDP timeout active while reading a response body that never resolves', async () => {
    let signal: AbortSignal | undefined;
    const { peer, track, audio, waits, voice } = setup({ fetch: async (_input, init) => {
      signal = init.signal;
      return {
        ok: true,
        text: () => new Promise<string>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })),
      };
    } });
    const connecting = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 });
    await readyForPeer(peer);
    await expirePendingSleeps(waits, () => signal?.aborted === true);
    await expect(connecting).rejects.toThrow('实时语音连接不可用。');
    expect(signal?.aborted).toBe(true);
    expect(track.stopped).toBe(true);
    expect(peer.outbound.closed).toBe(true);
    expect(peer.closed).toBe(true);
    expect(audio.paused).toBe(true);
  });

  it.each(['disconnected', 'failed', 'closed'] as const)('releases resources once and rejects commands after the peer becomes %s', async (state) => {
    const { peer, track, audio, voice } = setup();
    const connectionPromise = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 }); await readyForPeer(peer); peer.deliverInbound();
    const connection = await connectionPromise;
    const events: string[] = [];
    connection.subscribe((event) => { events.push(event.type === 'connection' ? `${event.type}:${event.state}` : event.type); });
    const sentBeforeDisconnect = peer.outbound.sent.length;

    peer.connectionState = state as FakePeer['connectionState'];
    peer.onconnectionstatechange?.();
    peer.onconnectionstatechange?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(events).toEqual(['connection:disconnected']);
    expect(track.stopped).toBe(true);
    expect(peer.inbound.closed).toBe(true);
    expect(peer.outbound.closed).toBe(true);
    expect(peer.closed).toBe(true);
    expect(audio.paused).toBe(true);
    await expect(connection.cancelAssistantSpeech()).rejects.toThrow('实时语音连接已断开。');
    await expect(connection.submitAnswer()).rejects.toThrow('实时语音连接已断开。');
    await expect(connection.injectProgress({ phase: 'fullstack', coveredTopics: [], evidence: [], pendingFollowUps: [], updatedThroughSequence: 0 })).rejects.toThrow('实时语音连接已断开。');
    expect(peer.outbound.sent).toHaveLength(sentBeforeDisconnect);
    await connection.close();
    expect(events).toEqual(['connection:disconnected']);
  });

  it('times out stalled ICE gathering and releases local media and peer resources', async () => {
    const { peer, track, waits, voice } = setup({ iceGatheringState: 'gathering' });
    const connecting = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 });
    const rejected = expect(connecting).rejects.toThrow('实时语音连接不可用。');
    await readyForPeer(peer);
    await expirePendingSleeps(waits, () => peer.closed);
    await rejected;
    expect(track.stopped).toBe(true);
    expect(peer.outbound.closed).toBe(true);
    expect(peer.closed).toBe(true);
  });

  it('times out a missing inbound session.created event and releases negotiated resources', async () => {
    const { peer, track, waits, voice } = setup();
    const connecting = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 });
    const rejected = expect(connecting).rejects.toThrow('实时语音连接不可用。');
    await readyForPeer(peer);
    await expirePendingSleeps(waits, () => peer.closed);
    await rejected;
    expect(track.stopped).toBe(true);
    expect(peer.outbound.closed).toBe(true);
    expect(peer.closed).toBe(true);
  });

  it('times out an inbound txt channel that never sends session.created', async () => {
    const { peer, track, waits, voice } = setup();
    const connecting = voice.connect({ instructions: 'instructions', resumeFromSequence: 0 });
    const rejected = expect(connecting).rejects.toThrow('实时语音连接不可用。');
    await readyForPeer(peer);
    peer.deliverInboundChannel();
    await expirePendingSleeps(waits, () => peer.closed);
    await rejected;
    expect(track.stopped).toBe(true);
    expect(peer.inbound.closed).toBe(true);
    expect(peer.outbound.closed).toBe(true);
    expect(peer.closed).toBe(true);
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
