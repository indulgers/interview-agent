import type { InterviewHistory } from '../interview-history/types';
import { buildFeedbackPrompt, buildRepairPrompt } from './prompt';
import { FeedbackResultSchema, type FeedbackModel, type FeedbackResult } from './schema';

export async function generateInterviewFeedback(sessionId: string, dependencies: {
  history: InterviewHistory;
  model: FeedbackModel;
  now(): number;
}): Promise<FeedbackResult> {
  const detail = await dependencies.history.detail(sessionId);
  if (!detail || detail.session.result !== 'completed' || !detail.turns.some((turn) => turn.speaker === 'candidate')) {
    throw new Error('这场面试不能生成反馈');
  }
  if (!await dependencies.history.claimFeedback(sessionId)) throw new Error('反馈正在生成或已完成');
  const prompt = buildFeedbackPrompt(detail);
  const validIds = new Set(detail.turns.map((turn) => turn.id));
  let currentPrompt = prompt;
  let failure = '反馈格式无效';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = FeedbackResultSchema.parse(await dependencies.model.generate(currentPrompt));
      const cited = [
        ...result.dimensions.flatMap((dimension) => dimension.evidenceTurnIds),
        ...result.strengths.map((item) => item.turnId),
        ...result.weakMoments.map((item) => item.turnId),
      ];
      const invented = cited.find((id) => !validIds.has(id));
      if (invented) throw new Error(`证据 turn id 不存在：${invented}`);
      if (detail.session.completeness === 'missing' && !result.missingTranscriptWarning) throw new Error('转写缺失时必须给出警告');
      await dependencies.history.setFeedback(sessionId, { status: 'completed', result, generatedAt: dependencies.now() });
      return result;
    } catch (error) {
      failure = error instanceof Error ? error.message : failure;
      currentPrompt = buildRepairPrompt(prompt, failure);
    }
  }
  await dependencies.history.setFeedback(sessionId, { status: 'failed', failureType: 'invalid_model_output', generatedAt: dependencies.now() });
  throw new Error(failure);
}
