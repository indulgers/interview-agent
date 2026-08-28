import { describe, expect, it } from 'vitest';

import { spikeControlsEnabled } from './realtime-spike-state';

describe('spikeControlsEnabled', () => {
  it('enables end-answer and cancel controls only after the connection state is established', () => {
    expect(spikeControlsEnabled(false)).toBe(false);
    expect(spikeControlsEnabled(true)).toBe(true);
  });
});
