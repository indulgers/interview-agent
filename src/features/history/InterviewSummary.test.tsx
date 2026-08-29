import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { SessionDetail } from '../../modules/interview-history/types';
import { createSummaryLifecycle, InterviewSummary, requestFeedback, SessionDetailSchema } from './InterviewSummary';

const feedbackResult = {
  dimensions: [
    { id: 'project_ownership', score: 4, insufficientEvidence: false, evidenceTurnIds: ['candidate-1'], assessment: '讲清了个人贡献。', nextStep: '补充量化成果。' },
    { id: 'node_backend', score: 4, insufficientEvidence: false, evidenceTurnIds: ['candidate-1'], assessment: '解释了服务边界。', nextStep: '补充故障处理。' },
    { id: 'frontend_delivery', score: 3, insufficientEvidence: false, evidenceTurnIds: ['candidate-1'], assessment: '说明了交付过程。', nextStep: '补充验收方式。' },
    { id: 'ai_agent', score: 3, insufficientEvidence: false, evidenceTurnIds: ['candidate-1'], assessment: '描述了 Agent 实践。', nextStep: '补充评估方法。' },
    { id: 'system_design', score: 4, insufficientEvidence: false, evidenceTurnIds: ['candidate-1'], assessment: '权衡描述充分。', nextStep: '补充容量估算。' },
    { id: 'communication', score: 4, insufficientEvidence: false, evidenceTurnIds: ['candidate-1'], assessment: '表达清晰。', nextStep: '先说结论。' },
  ],
  strengths: [
    { turnId: 'candidate-1', title: '清晰拆解', reason: '回答有结构。' },
    { turnId: 'candidate-1', title: '真实细节', reason: '给出了实际取舍。' },
    { turnId: 'candidate-1', title: '持续追问', reason: '能补充背景。' },
  ],
  weakMoments: [
    { turnId: 'candidate-1', title: '量化不足', missing: '缺少指标。', betterOutline: '先给结果。' },
    { turnId: 'candidate-1', title: '风险不足', missing: '缺少风险。', betterOutline: '补充处理。' },
    { turnId: 'candidate-1', title: '复盘不足', missing: '缺少复盘。', betterOutline: '给出改进。' },
  ],
  priorities: [
    { title: '补充数据', action: '准备指标。' },
    { title: '练习结构', action: '按 STAR 回答。' },
    { title: '复盘追问', action: '记录遗漏。' },
  ],
  missingTranscriptWarning: null,
};

function detail(feedbackStatus: SessionDetail['session']['feedbackStatus']): SessionDetail {
  const isNotApplicable = feedbackStatus === 'not_applicable';
  return {
    session: { id: 'session-1', startedAt: new Date(0), endedAt: new Date(60_000), targetDurationMs: 2_700_000, actualDurationMs: 60_000, result: isNotApplicable ? 'cancelled' : 'completed', completeness: 'complete', feedbackStatus, hasTranscriptGap: false },
    snapshot: { version: '2026-08-29', hash: 'a'.repeat(64), candidateProfileVersion: '2026-08-29', candidateProfileHash: 'b'.repeat(64), interviewBriefVersion: '2026-08-29', interviewBriefHash: 'c'.repeat(64), candidateProfile: '画像', interviewBrief: '说明' },
    turns: isNotApplicable ? [] : [{ id: 'candidate-1', providerTurnId: 'provider-1', sequence: 1, speaker: 'candidate', text: '我的回答', startedAt: null, endedAt: null, hasGap: false }],
    feedback: feedbackStatus === 'completed' ? { status: 'completed', failureType: null, result: feedbackResult, generatedAt: new Date(60_000) } : { status: feedbackStatus, failureType: null, result: null, generatedAt: null },
  };
}

describe('InterviewSummary', () => {
  it.each(['pending', 'generating'] as const)('shows useful progress and all exits while %s feedback is unresolved', (status) => {
    const html = renderToStaticMarkup(<InterviewSummary detail={detail(status)} />);

    expect(html).toContain('正在分析本场回答');
    expect(html).toContain('href="/"');
    expect(html).toContain('返回首页');
    expect(html).toContain('href="/history"');
    expect(html).toContain('查看面试记录');
    expect(html).toContain('href="/interview"');
    expect(html).toContain('再练一场');
  });

  it('renders completed feedback, a retryable failure, and an evidence-insufficient summary distinctly', () => {
    expect(renderToStaticMarkup(<InterviewSummary detail={detail('completed')} />)).toContain('六维反馈');
    expect(renderToStaticMarkup(<InterviewSummary detail={detail('failed')} />)).toContain('重新生成反馈');
    const unavailable = renderToStaticMarkup(<InterviewSummary detail={detail('not_applicable')} />);
    expect(unavailable).toContain('本场证据不足以形成稳定的六维评价。');
    expect(unavailable).not.toContain('项目真实性与个人贡献');
  });
});

describe('SessionDetailSchema', () => {
  it('accepts a pending detail without a feedback wrapper and materializes serialized dates', () => {
    const pending = detail('pending');
    pending.feedback = null;

    const parsed = SessionDetailSchema.parse(JSON.parse(JSON.stringify(pending)));

    expect(parsed.feedback).toBeNull();
    expect(parsed.session.startedAt).toBeInstanceOf(Date);
    expect(parsed.session.endedAt).toBeInstanceOf(Date);
  });

  it('rejects a completed detail whose feedback result is malformed', () => {
    const completed = detail('completed');
    completed.feedback = { status: 'completed', failureType: null, result: { dimensions: [] }, generatedAt: new Date(60_000) };

    expect(() => SessionDetailSchema.parse(JSON.parse(JSON.stringify(completed)))).toThrow();
  });
});

describe('summary lifecycle', () => {
  it('starts pending feedback once and never overlaps detail polling', async () => {
    vi.useFakeTimers();
    let resolveDetail: ((response: Response) => void) | undefined;
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Promise<Response>(() => {});
      return new Promise<Response>((resolve) => { resolveDetail = resolve; });
    });
    const lifecycle = createSummaryLifecycle({ sessionId: 'session-1', status: 'pending', fetcher, onDetail: vi.fn(), onTimeout: vi.fn() });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/interviews/session-1/feedback');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });

    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(4_500);
    expect(fetcher).toHaveBeenCalledTimes(2);

    resolveDetail?.(Response.json(detail('completed')));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    lifecycle.stop();
    vi.useRealTimers();
  });

  it('aborts an in-flight request when the summary is left', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const lifecycle = createSummaryLifecycle({ sessionId: 'session-1', status: 'generating', fetcher, onDetail: vi.fn(), onTimeout: vi.fn() });

    await vi.advanceTimersByTimeAsync(1_500);
    lifecycle.stop();
    expect(signal?.aborted).toBe(true);
    vi.useRealTimers();
  });

  it('stops a stuck poll at the useful 60-second timeout', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const onTimeout = vi.fn();
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const lifecycle = createSummaryLifecycle({ sessionId: 'session-1', status: 'generating', fetcher, onDetail: vi.fn(), onTimeout });

    await vi.advanceTimersByTimeAsync(60_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(true);
    lifecycle.stop();
    vi.useRealTimers();
  });

  it('keeps the last valid detail and stops polling when the detail response is malformed', async () => {
    vi.useFakeTimers();
    const onDetail = vi.fn();
    const onError = vi.fn();
    const fetcher = vi.fn(async () => Response.json({ session: { id: 'broken' } }));
    const lifecycle = createSummaryLifecycle({ sessionId: 'session-1', status: 'generating', fetcher, onDetail, onTimeout: vi.fn(), onError });

    await vi.advanceTimersByTimeAsync(1_500);
    await vi.advanceTimersByTimeAsync(6_000);
    expect(onDetail).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    lifecycle.stop();
    vi.useRealTimers();
  });

  it('stops polling with a recoverable error after a non-success detail response', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const lifecycle = createSummaryLifecycle({ sessionId: 'session-1', status: 'generating', fetcher, onDetail: vi.fn(), onTimeout: vi.fn(), onError });

    await vi.advanceTimersByTimeAsync(7_500);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    lifecycle.stop();
    vi.useRealTimers();
  });
});

describe('feedback request', () => {
  it('reports a successful generation claim', async () => {
    await expect(requestFeedback('session-1', async () => new Response(null, { status: 204 }))).resolves.toBe(true);
  });

  it.each([
    ['a rejected POST', async () => { throw new Error('offline'); }],
    ['a non-success POST', async () => new Response(null, { status: 503 })],
  ])('allows another retry after %s', async (_label, fetcher) => {
    await expect(requestFeedback('session-1', fetcher)).resolves.toBe(false);
    await expect(requestFeedback('session-1', async () => new Response(null, { status: 204 }))).resolves.toBe(true);
  });
});
