import { notFound } from 'next/navigation';
import { HistoryDetail } from '../../../features/history/HistoryDetail';
import { getServerInterviewHistory } from '../../../modules/interview-history/server-history';

export const dynamic = 'force-dynamic';
export default async function HistoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const detail = await getServerInterviewHistory().detail((await params).id);
  if (!detail) notFound();
  return <HistoryDetail detail={detail} />;
}
