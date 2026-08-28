import Link from 'next/link';
import type { SessionSummary } from '../../modules/interview-history/types';

const result = { completed: '已完成', interrupted: '已中断', cancelled: '已取消', in_progress: '进行中' } as const;
const feedback = { pending: '待生成反馈', generating: '正在生成反馈', completed: '反馈已完成', failed: '反馈失败', not_applicable: '无反馈' } as const;
function duration(ms: number | null) { if (ms === null) return '--:--'; const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }

export function HistoryList({ sessions }: { sessions: SessionSummary[] }) {
  const ordered = [...sessions].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  if (!ordered.length) return <div className="history-empty"><h2>还没有面试记录</h2><p>完成第一场模拟面试后，转写和反馈会出现在这里。</p><Link href="/interview">开始面试</Link></div>;
  return <div className="history-list">{ordered.map((session) => <Link className="history-row" href={`/history/${session.id}`} key={session.id}>
    <span className="history-date">{session.startedAt.toLocaleString('zh-CN', { hour12: false })}</span>
    <strong>{session.id}</strong>
    <span className="history-badges"><i>{result[session.result]}</i><i>{duration(session.actualDurationMs)}</i><i>{feedback[session.feedbackStatus]}</i><i>{session.completeness === 'missing' ? '转写不完整' : '转写完整'}</i></span>
  </Link>)}</div>;
}
