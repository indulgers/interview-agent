'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { FeedbackResultSchema } from '../../modules/interview-feedback/schema';
import type { FeedbackStatus, SessionDetail } from '../../modules/interview-history/types';

const dimensionNames: Record<string, string> = { project_ownership: '项目真实性与个人贡献', node_backend: 'Node.js 后端', frontend_delivery: '前端与全栈交付', ai_agent: 'AI Agent 应用', system_design: '系统设计与工程取舍', communication: '表达与追问应对' };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export function createSummaryLifecycle({ sessionId, status, fetcher, onDetail, onTimeout }: {
  sessionId: string;
  status: Extract<FeedbackStatus, 'pending' | 'generating'>;
  fetcher: Fetcher;
  onDetail(detail: SessionDetail): void;
  onTimeout(): void;
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
      if (!response.ok) return;
      const detail = await response.json() as SessionDetail;
      if (!active) return;
      onDetail(detail);
      if (detail.session.feedbackStatus === 'completed' || detail.session.feedbackStatus === 'failed' || detail.session.feedbackStatus === 'not_applicable') {
        stop();
        return;
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        // A later poll may recover from a transient network error.
      }
    } finally {
      inFlight = false;
      controller = undefined;
      if (active) schedule();
    }
  };

  if (status === 'pending') {
    void fetcher(`/api/interviews/${encodeURIComponent(sessionId)}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => undefined);
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
  const pendingStarted = useRef(false);
  const status = current.session.feedbackStatus;
  const feedback = FeedbackResultSchema.safeParse(current.feedback?.result);

  useEffect(() => {
    if (status !== 'pending' && status !== 'generating') return;
    const startsGeneration = status === 'pending' && !pendingStarted.current;
    if (startsGeneration) pendingStarted.current = true;
    return createSummaryLifecycle({
      sessionId: current.session.id,
      status: startsGeneration ? 'pending' : 'generating',
      fetcher: fetch,
      onDetail: (next) => { setCurrent(next); setRetryError(false); },
      onTimeout: () => setTimedOut(true),
    }).stop;
  }, [current.session.id, status]);

  const retry = () => {
    setRetryError(false);
    setTimedOut(false);
    setCurrent((previous) => ({ ...previous, session: { ...previous.session, feedbackStatus: 'generating' }, feedback: { status: 'generating', failureType: null, result: null, generatedAt: null } }));
    void fetch(`/api/interviews/${encodeURIComponent(current.session.id)}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => setRetryError(true));
  };

  const answerCount = current.turns.filter((turn) => turn.speaker === 'candidate').length;
  return <section className="interview-summary" aria-live="polite">
    <p className="summary-metadata">已保存 {formatDuration(current.session.actualDurationMs)} · {answerCount} 轮回答</p>
    {(status === 'pending' || status === 'generating') && <div className="summary-progress"><h2>正在分析本场回答</h2><p>{timedOut ? '仍在生成，可稍后从面试记录查看。' : '面试记录已保存，你可以先离开，分析会在这里自动更新。'}</p></div>}
    {status === 'completed' && (feedback.success ? <div className="summary-completed"><h2>六维反馈</h2><div className="dimension-grid">{feedback.data.dimensions.map((item) => <article key={item.id}><span>{dimensionNames[item.id]}</span><strong>{item.insufficientEvidence ? '未充分验证' : `${item.score} / 5`}</strong><p>{item.assessment}</p><small>{item.nextStep}</small></article>)}</div><h3>优先练习建议</h3><ol className="summary-priorities">{feedback.data.priorities.map((item) => <li key={item.title}><strong>{item.title}</strong><span>{item.action}</span></li>)}</ol></div> : <div className="summary-progress"><h2>反馈已完成</h2><p>反馈内容正在同步，请稍后从面试记录查看。</p></div>)}
    {status === 'failed' && <div className="summary-failed"><h2>反馈暂未生成</h2><p>已保存的转写不会丢失。</p><button type="button" onClick={retry}>重新生成反馈</button>{retryError && <p role="alert">请求没有发出，请稍后重试。</p>}</div>}
    {status === 'not_applicable' && <div className="summary-not-applicable"><h2>证据不足，未生成六维评价</h2><p>这场面试在出现候选人完整回答前结束，已为你保留记录与时长。</p></div>}
    <SummaryActions />
  </section>;
}
