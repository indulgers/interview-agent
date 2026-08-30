import { describe, expect, it, vi } from 'vitest';

import { submitAnswerAndRefresh } from './useInterviewSession';

describe('submitAnswerAndRefresh', () => {
  it('refreshes immediately for busy state and again in finally after a provider failure', async () => {
    let reject!: (cause: Error) => void;
    const submission = new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const refresh = vi.fn();
    const result = submitAnswerAndRefresh(() => submission, refresh);

    expect(refresh).toHaveBeenCalledTimes(1);
    reject(new Error('provider failed'));
    await expect(result).rejects.toThrow('provider failed');
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
