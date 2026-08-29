'use client';

import type { SessionDetail } from '../../modules/interview-history/types';
import { DeleteInterview } from './DeleteInterview';
import { AppNavigation } from '../navigation/AppNavigation';
import { InterviewSummary } from './InterviewSummary';

export function HistoryDetail({ detail, showDelete = true }: { detail: SessionDetail; showDelete?: boolean }) {
  return <main className="detail-shell">
    <header className="detail-header"><AppNavigation active="history" /><span>内容版本 {detail.snapshot.version}</span></header>
    <section className="detail-title"><p className="eyebrow">面试总结</p><h1>{detail.session.startedAt.toLocaleString('zh-CN', { hour12: false })}</h1><p>{detail.session.completeness === 'missing' ? '部分转写缺失，请结合上下文阅读反馈。' : '这场面试已安全保存，你可以在下方回看表现与对话。'}</p></section>
    <InterviewSummary detail={detail} />
    <section className="detail-section"><div className="detail-section__heading"><p>对话回看</p><h2>完整对话</h2></div><ol className="transcript-list">{[...detail.turns].sort((a, b) => a.sequence - b.sequence).map((turn) => <li className={`transcript-turn transcript-turn--${turn.speaker}`} key={turn.id}><span>{turn.speaker === 'ai' ? '面试官' : '你'} · {turn.sequence}</span><p>{turn.text}</p>{turn.hasGap && <small>此处转写可能不完整</small>}</li>)}</ol></section>
    {showDelete && <DeleteInterview id={detail.session.id} />}
  </main>;
}
