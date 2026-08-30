import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SessionDetail } from '../../modules/interview-history/types';
import { HistoryDetail } from './HistoryDetail';

describe('HistoryDetail', () => {
  it('shows ordered full transcript, snapshot version, six dimensions and retry for failed feedback', () => {
    const detail = {
      session: { id: 'session-1', startedAt: new Date(0), endedAt: new Date(1), targetDurationMs: 2_700_000, actualDurationMs: 1, result: 'completed', completeness: 'complete', feedbackStatus: 'failed', hasTranscriptGap: false },
      snapshot: { version: '2026-08-27', hash: 'a'.repeat(64), candidateProfileVersion: '2026-08-27', candidateProfileHash: 'b'.repeat(64), interviewBriefVersion: '2026-08-27', interviewBriefHash: 'c'.repeat(64), candidateProfile: '画像', interviewBrief: '说明' },
      turns: [
        { id: 'second', providerTurnId: 'p2', sequence: 2, speaker: 'candidate', text: '第二句回答', startedAt: null, endedAt: null, hasGap: false },
        { id: 'first', providerTurnId: 'p1', sequence: 1, speaker: 'ai', text: '第一个问题', startedAt: null, endedAt: null, hasGap: false },
      ], feedback: { status: 'failed', failureType: 'invalid', result: null, generatedAt: null },
    } satisfies SessionDetail;
    const html = renderToStaticMarkup(<HistoryDetail detail={detail} showDelete={false} />);
    expect(html.indexOf('第一个问题')).toBeLessThan(html.indexOf('第二句回答'));
    expect(html).toContain('2026-08-27'); expect(html).toContain('重新生成反馈');
    expect(html).toContain('面试记录'); expect(html).toContain('aria-current="page"');
  });
});
