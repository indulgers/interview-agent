import { getServerInterviewHistory } from '../../../modules/interview-history/server-history';

export async function GET() {
  try { const history = getServerInterviewHistory(); await history.recoverAbandoned(); return Response.json(await history.list()); }
  catch { return Response.json({ error: '历史记录不可用' }, { status: 500 }); }
}
