import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '../../modules/interview-history/types';
import { HistoryList } from './HistoryList';

const row = (id: string, startedAt: number, overrides: Partial<SessionSummary> = {}): SessionSummary => ({
  id, startedAt: new Date(startedAt), endedAt: new Date(startedAt + 1), targetDurationMs: 2_700_000, actualDurationMs: 60_000,
  result: 'completed', completeness: 'complete', feedbackStatus: 'completed', hasTranscriptGap: false, ...overrides,
});

describe('HistoryList', () => {
  it('sorts newest first and shows result, duration, feedback, and completeness badges', () => {
    const html = renderToStaticMarkup(<HistoryList sessions={[row('older', 1), row('newer', 2, { result: 'interrupted', completeness: 'missing', feedbackStatus: 'failed' })]} />);
    expect(html.indexOf('newer')).toBeLessThan(html.indexOf('older'));
    expect(html).toContain('已中断'); expect(html).toContain('01:00'); expect(html).toContain('反馈失败'); expect(html).toContain('转写不完整');
  });
});
