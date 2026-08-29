'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';

import { FeedbackResultSchema } from '../../modules/interview-feedback/schema';
import type { FeedbackStatus, SessionDetail } from '../../modules/interview-history/types';

const dimensionNames: Record<string, string> = { project_ownership: '项目真实性与个人贡献', node_backend: 'Node.js 后端', frontend_delivery: '前端与全栈交付', ai_agent: 'AI Agent 应用', system_design: '系统设计与工程取舍', communication: '表达与追问应对' };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const FeedbackStatusSchema = z.enum(['pending', 'generating', 'completed', 'failed', 'not_applicable']);
const DateSchema = z.coerce.date();
const SessionDetailPayloadSchema = z.object({
  session: z.object({
    id: z.string().trim().min(1),
    startedAt: DateSchema,
    endedAt: DateSchema.nullable(),
    targetDurationMs: z.number().int().nonnegative().safe(),
    actualDurationMs: z.number().int().nonnegative().safe().nullable(),
    result: z.enum(['in_progress', 'completed', 'interrupted', 'cancelled']),
    completeness: z.enum(['complete', 'missing']),
    feedbackStatus: FeedbackStatusSchema,
    hasTranscriptGap: z.boolean(),
  }).strict(),
  snapshot: z.object({
    version: z.string().trim().min(1),
    hash: z.string().regex(/^[a-f0-9]{64}$/i),
    candidateProfileVersion: z.string().trim().min(1),
    candidateProfileHash: z.string().regex(/^[a-f0-9]{64}$/i),
    interviewBriefVersion: z.string().trim().min(1),
    interviewBriefHash: z.string().regex(/^[a-f0-9]{64}$/i),
    candidateProfile: z.string().min(1),
    interviewBrief: z.string().min(1),
  }).strict(),
  turns: z.array(z.object({
    id: z.string().trim().min(1),
    providerTurnId: z.string().trim().min(1),
    sequence: z.number().int().positive().safe(),
    speaker: z.enum(['candidate', 'ai']),
    text: z.string().min(1),
    startedAt: DateSchema.nullable(),
    endedAt: DateSchema.nullable(),
    hasGap: z.boolean(),
  }).strict()),
  feedback: z.object({
    status: FeedbackStatusSchema,
    failureType: z.string().nullable(),
    result: z.unknown().nullable(),
    generatedAt: DateSchema.nullable(),
  }).strict().nullable(),
}).superRefine((value, context) => {
  if (!value.feedback) {
    if (value.session.feedbackStatus !== 'pending') context.addIssue({ code: 'custom', message: '缺少反馈状态包装' });
    return;
  }
  if (value.feedback.status !== value.session.feedbackStatus) context.addIssue({ code: 'custom', message: '反馈状态不一致' });
  if (value.session.feedbackStatus === 'completed' && !FeedbackResultSchema.safeParse(value.feedback.result).success) context.addIssue({ code: 'custom', message: '已完成反馈无效' });
  if (value.session.feedbackStatus !== 'completed' && value.feedback.result !== null) context.addIssue({ code: 'custom', message: '未完成反馈不应包含结果' });
});

export const SessionDetailSchema = SessionDetailPayloadSchema;

export async function requestFeedback(sessionId: string, fetcher: Fetcher, signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetcher(`/api/interviews/${encodeURIComponent(sessionId)}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal });
    return response.ok;
  } catch {
    return false;
  }
}

export function createSummaryLifecycle({ sessionId, status, fetcher, feedbackClaim, onDetail, onTimeout, onError, onGenerationFailure }: {
  sessionId: string;
  status: Extract<FeedbackStatus, 'pending' | 'generating'>;
  fetcher: Fetcher;
  feedbackClaim?: Promise<boolean>;
  onDetail(detail: SessionDetail): void;
  onTimeout(): void;
  onError?(): void;
  onGenerationFailure?(): void;
}) {
  let active = true;
  let inFlight = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const deadline = Date.now() + 60_000;
  const detailUrl = `/api/interviews/${encodeURIComponent(sessionId)}`;

  const stop = () => {
    active = false;
    if (timer) clearTimeout(timer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    controller?.abort();
  };

  const schedule = () => {
    if (!active) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      stop();
      onTimeout();
      return;
    }
    timer = setTimeout(refresh, Math.min(1_500, remaining));
  };

  const refresh = async () => {
    if (!active || inFlight) return;
    if (Date.now() >= deadline) {
      stop();
      onTimeout();
      return;
    }
    inFlight = true;
    controller = new AbortController();
    try {
      const response = await fetcher(detailUrl, { signal: controller.signal });
      if (!response.ok) {
        stop();
        onError?.();
        return;
      }
      const parsed = SessionDetailPayloadSchema.safeParse(await response.json());
      if (!parsed.success) {
        stop();
        onError?.();
        return;
      }
      const detail = parsed.data as SessionDetail;
      if (!active) return;
      onDetail(detail);
      if (detail.session.feedbackStatus === 'completed' || detail.session.feedbackStatus === 'failed' || detail.session.feedbackStatus === 'not_applicable') {
        stop();
        return;
      }
    } catch {
      if (active) {
        stop();
        onError?.();
      }
    } finally {
      inFlight = false;
      controller = undefined;
      if (active) schedule();
    }
  };

  if (status === 'pending') {
    const claim = feedbackClaim ?? requestFeedback(sessionId, fetcher);
    void claim.then((started) => {
      if (!active || started) return;
      stop();
      onGenerationFailure?.();
    });
  }
  timeoutTimer = setTimeout(() => {
    if (!active) return;
    stop();
    onTimeout();
  }, 60_000);
  schedule();
  return { stop };
}

function formatDuration(value: number | null) {
  if (value === null) return '已保存';
  const seconds = Math.floor(value / 1_000);
  return `${Math.floor(seconds / 60)} 分 ${String(seconds % 60).padStart(2, '0')} 秒`;
}

function SummaryActions() {
  return <nav className="summary-actions" aria-label="会后操作">
    <Link href="/">返回首页</Link>
    <Link href="/history">查看面试记录</Link>
    <Link className="summary-retry-link" href="/interview">再练一场</Link>
  </nav>;
}

export function InterviewSummary({ detail }: { detail: SessionDetail }) {
  const [current, setCurrent] = useState(detail);
  const [timedOut, setTimedOut] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const [pollingError, setPollingError] = useState(false);
  const pendingStarted = useRef(false);
  const pendingClaim = useRef<Promise<boolean> | null>(null);
  const retryController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const status = current.session.feedbackStatus;
  const feedback = FeedbackResultSchema.safeParse(current.feedback?.result);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; retryController.current?.abort(); };
  }, []);

  useEffect(() => {
    if (status !== 'pending' && status !== 'generating') return;
    const needsClaim = status === 'pending' && !pendingStarted.current;
    if (needsClaim) {
      pendingStarted.current = true;
      pendingClaim.current ??= requestFeedback(current.session.id, fetch);
    }
    return createSummaryLifecycle({
      sessionId: current.session.id,
      status,
      fetcher: fetch,
      feedbackClaim: status === 'pending' ? pendingClaim.current ?? undefined : undefined,
      onDetail: (next) => {
        setCurrent(next);
        if (next.session.feedbackStatus !== 'failed') setRetryError(false);
        setPollingError(false);
      },
      onTimeout: () => setTimedOut(true),
      onError: () => setPollingError(true),
      onGenerationFailure: () => {
        setCurrent((previous) => ({ ...previous, session: { ...previous.session, feedbackStatus: 'failed' }, feedback: { status: 'failed', failureType: null, result: null, generatedAt: null } }));
        setRetryError(true);
      },
    }).stop;
  }, [current.session.id, status]);

  const retry = () => {
    setRetryError(false);
    setPollingError(false);
    setTimedOut(false);
    setCurrent((previous) => ({ ...previous, session: { ...previous.session, feedbackStatus: 'generating' }, feedback: { status: 'generating', failureType: null, result: null, generatedAt: null } }));
    retryController.current?.abort();
    const controller = new AbortController();
    retryController.current = controller;
    void requestFeedback(current.session.id, fetch, controller.signal).then((started) => {
      if (!mounted.current || retryController.current !== controller || started) return;
      setCurrent((previous) => ({ ...previous, session: { ...previous.session, feedbackStatus: 'failed' }, feedback: { status: 'failed', failureType: null, result: null, generatedAt: null } }));
      setRetryError(true);
    });
  };

  const answerCount = current.turns.filter((turn) => turn.speaker === 'candidate').length;
  return <section className="interview-summary" aria-live="polite">
    <p className="summary-metadata">已保存 {formatDuration(current.session.actualDurationMs)} · {answerCount} 轮回答</p>
    {(status === 'pending' || status === 'generating') && <div className="summary-progress"><h2>正在分析本场回答</h2><p>{timedOut ? '仍在生成，可稍后从面试记录查看。' : pollingError ? '暂时无法更新反馈状态，请稍后从面试记录查看。' : '面试记录已保存，你可以先离开，分析会在这里自动更新。'}</p></div>}
    {status === 'completed' && (feedback.success ? <div className="summary-completed"><h2>六维反馈</h2><div className="dimension-grid">{feedback.data.dimensions.map((item) => <article key={item.id}><span>{dimensionNames[item.id]}</span><strong>{item.insufficientEvidence ? '未充分验证' : `${item.score} / 5`}</strong><p>{item.assessment}</p><small>{item.nextStep}</small></article>)}</div><h3>优先练习建议</h3><ol className="summary-priorities">{feedback.data.priorities.map((item) => <li key={item.title}><strong>{item.title}</strong><span>{item.action}</span></li>)}</ol></div> : <div className="summary-progress"><h2>反馈已完成</h2><p>反馈内容正在同步，请稍后从面试记录查看。</p></div>)}
    {status === 'failed' && <div className="summary-failed"><h2>反馈暂未生成</h2><p>已保存的转写不会丢失。</p><button type="button" onClick={retry}>重新生成反馈</button>{retryError && <p role="alert">仍未生成，请稍后再试。</p>}</div>}
    {status === 'not_applicable' && <div className="summary-not-applicable"><h2>证据不足，未生成六维评价</h2><p>本场证据不足以形成稳定的六维评价。</p></div>}
    <SummaryActions />
  </section>;
}
