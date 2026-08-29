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
    (window as Window & { __interviewE2E?: { emit(event: VoiceEvent): Promise<void>; failConnects(count: number): void; connectionCount(): number; cancelCount(): number } }).__interviewE2E = {
      emit: (event) => active().emit(event),
      failConnects: (count) => { for (let index = 0; index < count; index++) active().enqueueConnectFailure(new Error('test reconnect failure')); },
      connectionCount: () => active().connections.length,
      cancelCount: () => active().connections.reduce((total, connection) => total + connection.cancelAssistantSpeechCount, 0),
    };
  }
  return selected;
}
