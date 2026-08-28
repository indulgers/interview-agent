import { BailianFeedbackModel } from '../../../../../modules/interview-feedback/bailian-text-model';
import { generateInterviewFeedback } from '../../../../../modules/interview-feedback/feedback';
import { getServerInterviewHistory } from '../../../../../modules/interview-history/server-history';
import { handleFeedbackGeneration } from './handler';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return handleFeedbackGeneration(id, {
    generate: (sessionId) => generateInterviewFeedback(sessionId, {
      history: getServerInterviewHistory(), model: new BailianFeedbackModel(), now: () => Date.now(),
    }),
  });
}
