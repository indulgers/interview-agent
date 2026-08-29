import { describe, expect, it } from 'vitest';
import { MemoryRealtimeVoice } from './memory-realtime-voice';
import { selectRuntimeVoice } from './runtime-voice';

describe('selectRuntimeVoice', () => {
  it('selects memory voice only for NODE_ENV=test', () => {
    const production = { connect: async () => { throw new Error('unused'); } };
    const memory = new MemoryRealtimeVoice();
    expect(selectRuntimeVoice('test', production, memory)).toBe(memory);
    expect(selectRuntimeVoice('production', production, memory)).toBe(production);
    expect(selectRuntimeVoice('development', production, memory)).toBe(production);
  });

  it('cannot be enabled by query-like or public environment values', () => {
    const production = { connect: async () => { throw new Error('unused'); } };
    const memory = new MemoryRealtimeVoice();
    expect(selectRuntimeVoice('production?voice=memory', production, memory)).toBe(production);
    expect(selectRuntimeVoice('NEXT_PUBLIC_MEMORY', production, memory)).toBe(production);
  });
});
