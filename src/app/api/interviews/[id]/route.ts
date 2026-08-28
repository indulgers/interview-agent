import { getServerInterviewHistory } from '../../../../modules/interview-history/server-history';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; const detail = await getServerInterviewHistory().detail(id); return detail ? Response.json(detail) : Response.json({ error: '记录不存在' }, { status: 404 }); }
  catch { return Response.json({ error: '历史记录不可用' }, { status: 500 }); }
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; await getServerInterviewHistory().delete(id); return Response.json(null); }
  catch { return Response.json({ error: '删除失败' }, { status: 400 }); }
}
