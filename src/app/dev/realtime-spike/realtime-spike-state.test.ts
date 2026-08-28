import { describe, expect, it } from 'vitest';

import { closeSpikeConnection, runSpikeAction, spikeConnectionState, spikeControlsEnabled } from './realtime-spike-state';

describe('spikeControlsEnabled', () => {
  it('enables end-answer and cancel controls only after the connection state is established', () => {
    expect(spikeControlsEnabled(false)).toBe(false);
    expect(spikeControlsEnabled(true)).toBe(true);
  });

  it('closes the active connection for explicit disconnect and unmount lifecycle cleanup', async () => {
    let closeCount = 0;
    await closeSpikeConnection({ close: async () => { closeCount++; } });
    await closeSpikeConnection(null);
    expect(closeCount).toBe(1);
  });

  it('marks the spike disconnected when its subscribed connection event reports a disconnect', () => {
    expect(spikeConnectionState(true, { type: 'connection', state: 'disconnected', at: 1 })).toBe(false);
    expect(spikeConnectionState(false, { type: 'connection', state: 'connected', at: 2 })).toBe(true);
    expect(spikeConnectionState(true, { type: 'error', category: 'ai_unavailable', message: 'ignored here', at: 3 })).toBe(true);
  });

  it('contains rejected button actions so component event handlers do not leave unhandled promises', async () => {
    let failure = '';
    await expect(runSpikeAction(async () => { throw new Error('connection closed'); }, () => { failure = '操作不可用。'; })).resolves.toBeUndefined();
    expect(failure).toBe('操作不可用。');
  });
});
