'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FeedbackResultSchema } from '../../modules/interview-feedback/schema';
import type { SessionDetail } from '../../modules/interview-history/types';
import { DeleteInterview } from './DeleteInterview';

const dimensionNames: Record<string, string> = { project_ownership: '项目真实性与个人贡献', node_backend: 'Node.js 后端', frontend_delivery: '前端与全栈交付', ai_agent: 'AI Agent 应用', system_design: '系统设计与工程取舍', communication: '表达与追问应对' };

export function HistoryDetail({ detail, showDelete = true }: { detail: SessionDetail; showDelete?: boolean }) {
  const feedback = FeedbackResultSchema.safeParse(detail.feedback?.result);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const retry = async () => {
    setRetrying(true); setRetryError(false);
    const response = await fetch(`/api/interviews/${encodeURIComponent(detail.session.id)}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (response.ok) window.location.reload(); else { setRetryError(true); setRetrying(false); }
  };
  return <main className="detail-shell">
    <header className="detail-header"><Link href="/history">← 历史记录</Link><span>内容版本 {detail.snapshot.version}</span></header>
    <section className="detail-title"><p className="eyebrow">INTERVIEW RECORD</p><h1>{detail.session.startedAt.toLocaleString('zh-CN', { hour12: false })}</h1><p>{detail.session.completeness === 'missing' ? '部分转写缺失，请结合上下文阅读反馈。' : '最终转写已完整保存。'}</p></section>
    <section className="detail-section"><h2>完整对话</h2><ol className="transcript-list">{[...detail.turns].sort((a, b) => a.sequence - b.sequence).map((turn) => <li key={turn.id}><span>{turn.speaker === 'ai' ? '面试官' : '你'} · {turn.sequence}</span><p>{turn.text}</p>{turn.hasGap && <small>此处转写可能不完整</small>}</li>)}</ol></section>
    <section className="detail-section"><h2>六维反馈</h2>{feedback.success ? <div className="dimension-grid">{feedback.data.dimensions.map((item) => <article key={item.id}><span>{dimensionNames[item.id]}</span><strong>{item.insufficientEvidence ? '未充分验证' : `${item.score} / 5`}</strong><p>{item.assessment}</p><small>{item.nextStep}</small></article>)}</div> : <div className="feedback-empty"><p>{detail.session.feedbackStatus === 'failed' ? '上次反馈生成失败。' : '反馈尚未生成。'}</p><button type="button" disabled={retrying} onClick={() => { void retry(); }}>{retrying ? '正在生成…' : '重试生成反馈'}</button>{retryError && <p role="alert">仍未生成，请稍后再试。</p>}</div>}</section>
    {showDelete && <DeleteInterview id={detail.session.id} />}
  </main>;
}
