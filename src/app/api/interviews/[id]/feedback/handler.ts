export async function handleFeedbackGeneration(id: string, dependencies: { generate(id: string): Promise<unknown> }) {
  if (!id.trim()) return Response.json({ error: '面试记录无效' }, { status: 400 });
  try {
    return Response.json(await dependencies.generate(id));
  } catch {
    return Response.json({ error: '暂时无法生成反馈，可以稍后重试。' }, { status: 400 });
  }
}
