'use client';

import { createBrowserBailianRealtimeVoice } from './bailian/adapter';
import { MemoryRealtimeVoice } from './memory-realtime-voice';
import type { RealtimeVoice, VoiceEvent } from './port';

const testVoices: MemoryRealtimeVoice[] = [];

export function selectRuntimeVoice(nodeEnv: string | undefined, production: RealtimeVoice, test: RealtimeVoice): RealtimeVoice {
  return nodeEnv === 'test' ? test : production;
}

export function createRuntimeVoice(mediaStream?: MediaStream, serverConfirmedTestMode = false): RealtimeVoice {
  const production = createBrowserBailianRealtimeVoice('Tina', mediaStream);
  const memory = new MemoryRealtimeVoice();
  const selected = selectRuntimeVoice(serverConfirmedTestMode ? 'test' : process.env.NODE_ENV, production, memory);
  if (serverConfirmedTestMode && typeof window !== 'undefined') {
    testVoices.push(memory);
    const active = () => [...testVoices].reverse().find((voice) => voice.connections.length > 0) ?? testVoices.at(-1)!;
    let pendingConnect: ReturnType<MemoryRealtimeVoice['deferNextConnect']> | null = null;
    let pendingSubmit: { resolve(): void; reject(cause: Error): void } | null = null;
    (window as Window & { __interviewE2E?: Record<string, unknown> }).__interviewE2E = {
      emit: (event: VoiceEvent) => active().emit(event),
      failConnects: (count: number) => { for (let index = 0; index < count; index++) active().enqueueConnectFailure(new Error('test reconnect failure')); },
      deferNextConnect: () => { pendingConnect = active().deferNextConnect(); },
      resolveNextConnect: () => { pendingConnect?.resolve(); pendingConnect = null; },
      connectAttemptCount: () => active().connectInputs.length,
      connectionCount: () => active().connections.length,
      cancelCount: () => active().connections.reduce((total, connection) => total + connection.cancelAssistantSpeechCount, 0),
      deferNextSubmit: () => {
        let resolve!: () => void;
        let reject!: (cause: Error) => void;
        active().connections.at(-1)?.deferSubmit(new Promise<void>((accept, decline) => { resolve = accept; reject = decline; }));
        pendingSubmit = { resolve, reject };
      },
      rejectNextSubmit: () => { pendingSubmit?.reject(new Error('test answer submission failure')); pendingSubmit = null; },
      submitAnswerCount: () => active().connections.reduce((total, connection) => total + connection.submitAnswerCount, 0),
    };
  }
  return selected;
}
