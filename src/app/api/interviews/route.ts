import { getServerInterviewHistory } from '../../../modules/interview-history/server-history';

export async function GET() {
  try { return Response.json(await (await getServerInterviewHistory()).list()); }
  catch { return Response.json({ error: '历史记录不可用' }, { status: 500 }); }
}
