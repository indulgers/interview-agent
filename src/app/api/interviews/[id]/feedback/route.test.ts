import { describe, expect, it, vi } from 'vitest';

import { handleFeedbackGeneration } from './handler';

describe('feedback route handler', () => {
  it('returns completed feedback and sanitizes failures', async () => {
    const result = { dimensions: [] };
    const generate = vi.fn(async () => result);
    const response = await handleFeedbackGeneration('session-1', { generate });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(result);

    const failed = await handleFeedbackGeneration('session-1', { generate: vi.fn(async () => { throw new Error('provider secret'); }) });
    expect(failed.status).toBe(400);
    await expect(failed.text()).resolves.not.toContain('provider secret');
  });
});
