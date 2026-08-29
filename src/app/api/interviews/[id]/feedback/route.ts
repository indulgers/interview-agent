import { generateInterviewFeedback } from '../../../../../modules/interview-feedback/feedback';
import { createRuntimeFeedbackModel } from '../../../../../modules/interview-feedback/runtime-feedback-model';
import { getServerInterviewHistory } from '../../../../../modules/interview-history/server-history';
import { handleFeedbackGeneration, isSameOriginJsonMutation } from './handler';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginJsonMutation(_request)) return Response.json({ error: '请求来源无效' }, { status: 403 });
  const { id } = await context.params;
  return handleFeedbackGeneration(id, {
    generate: (sessionId) => generateInterviewFeedback(sessionId, {
      history: getServerInterviewHistory(),
      model: createRuntimeFeedbackModel(process.env.INTERVIEW_COMPILED_TEST_MODE === '1' ? 'test' : process.env.NODE_ENV),
      now: () => Date.now(),
    }),
  });
}
