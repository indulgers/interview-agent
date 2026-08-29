import { describe, expect, it } from 'vitest';

import { historySummaryPath } from './InterviewExperience';

describe('InterviewExperience terminal navigation', () => {
  it('builds a history-detail path for the persisted session', () => {
    expect(historySummaryPath('session-123')).toBe('/history/session-123');
  });

  it('encodes a session id before navigating', () => {
    expect(historySummaryPath('session/123')).toBe('/history/session%2F123');
  });
});
