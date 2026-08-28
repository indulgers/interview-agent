import { HistoryList } from '../../features/history/HistoryList';
import { getServerInterviewHistory } from '../../modules/interview-history/server-history';

export const dynamic = 'force-dynamic';
export default async function HistoryPage() {
  const history = getServerInterviewHistory();
  await history.recoverAbandoned();
  return <main className="history-shell"><header><Link href="/">AI 模拟面试</Link><Link href="/interview">开始新面试</Link></header><p className="eyebrow">LOCAL ARCHIVE</p><h1>历史记录</h1><HistoryList sessions={await history.list()} /></main>;
}
import Link from 'next/link';
