import 'server-only';

import { BailianFeedbackModel } from './bailian-text-model';
import { DIMENSION_IDS, type FeedbackModel } from './schema';

class TestFeedbackModel implements FeedbackModel {
  async generate(prompt: string): Promise<unknown> {
    const transcript = prompt.match(/(【|（id[^\n]*\n)(\[[\s\S]*\])$/)?.[2] ?? prompt.match(/(\[[\s\S]*\])$/)?.[1];
    const turns = transcript ? JSON.parse(transcript) as Array<{ id: string; speaker: string }> : [];
    const turnId = turns.find((turn) => turn.speaker === 'candidate')?.id;
    if (!turnId) throw new Error('test transcript missing candidate turn');
    return {
      dimensions: DIMENSION_IDS.map((id) => ({ id, score: 3, insufficientEvidence: false, evidenceTurnIds: [turnId], assessment: '测试证据支撑的评估。', nextStep: '继续练习结构化表达。' })),
      strengths: [1, 2, 3].map((index) => ({ turnId, title: `优点 ${index}`, reason: '回答包含具体证据。' })),
      weakMoments: [1, 2, 3].map((index) => ({ turnId, title: `改进 ${index}`, missing: '可增加量化结果。', betterOutline: '背景、行动、结果。' })),
      priorities: [1, 2, 3].map((index) => ({ title: `练习 ${index}`, action: '完成一次限时口述。' })), missingTranscriptWarning: null,
    };
  }
}

export function createRuntimeFeedbackModel(nodeEnv = process.env.NODE_ENV): FeedbackModel {
  return nodeEnv === 'test' ? new TestFeedbackModel() : new BailianFeedbackModel();
}
