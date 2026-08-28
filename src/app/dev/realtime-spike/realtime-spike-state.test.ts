import { describe, expect, it } from 'vitest';

import { closeSpikeConnection, spikeControlsEnabled } from './realtime-spike-state';

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
});
