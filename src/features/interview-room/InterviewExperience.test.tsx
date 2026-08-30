import { describe, expect, it } from 'vitest';

import { historySummaryPath, shouldNavigateToSummary } from './InterviewExperience';

describe('InterviewExperience terminal navigation', () => {
  it('builds a history-detail path for the persisted session', () => {
    expect(historySummaryPath('session-123')).toBe('/history/session-123');
  });

  it('encodes a session id before navigating', () => {
    expect(historySummaryPath('session/123')).toBe('/history/session%2F123');
  });

  it('does not make terminal navigation eligible until the end dialog is closed', () => {
    expect(shouldNavigateToSummary('completed', 'session-123', true)).toBe(false);
    expect(shouldNavigateToSummary('completed', 'session-123', false)).toBe(true);
  });
});
