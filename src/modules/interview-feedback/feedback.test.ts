import { describe, expect, it, vi } from 'vitest';

import { createContentSnapshot } from '../interview-content/content';
import type { InterviewHistory, SessionDetail } from '../interview-history/types';
import { generateInterviewFeedback } from './feedback';
import { FeedbackResultSchema } from './schema';

const dimensionIds = ['project_ownership', 'node_backend', 'frontend_delivery', 'ai_agent', 'system_design', 'communication'] as const;

function validResult() {
  return {
    dimensions: dimensionIds.map((id, index) => ({ id, score: index % 5 + 1, insufficientEvidence: false, evidenceTurnIds: ['turn-candidate'], assessment: '有具体事实支撑。', nextStep: '用 STAR 结构练习。' })),
    strengths: [1, 2, 3].map((index) => ({ turnId: 'turn-candidate', title: `优点${index}`, reason: '说明了责任边界。' })),
    weakMoments: [1, 2, 3].map((index) => ({ turnId: 'turn-candidate', title: `薄弱${index}`, missing: '缺少量化结果。', betterOutline: '问题、决策、结果。' })),
    priorities: [1, 2, 3].map((index) => ({ title: `优先项${index}`, action: '完成一次限时口述。' })),
    missingTranscriptWarning: null,
  };
}

function detail(): SessionDetail {
  return {
    session: { id: 'session-1', startedAt: new Date(0), endedAt: new Date(1), targetDurationMs: 2_700_000, actualDurationMs: 1, result: 'completed', completeness: 'complete', feedbackStatus: 'pending', hasTranscriptGap: false },
    snapshot: createContentSnapshot(),
    turns: [
      { id: 'turn-ai', providerTurnId: 'provider-ai', sequence: 1, speaker: 'ai', text: '请介绍你负责的项目。', startedAt: new Date(0), endedAt: new Date(1), hasGap: false },
      { id: 'turn-candidate', providerTurnId: 'provider-candidate', sequence: 2, speaker: 'candidate', text: '我负责 Node.js 接口与 Agent 上下文管理。', startedAt: new Date(1), endedAt: new Date(2), hasGap: false },
    ],
    feedback: null,
  };
}

function history(input = detail()) {
  return {
    detail: vi.fn(async () => input),
    setFeedback: vi.fn(async () => undefined),
  } as unknown as InterviewHistory;
}

describe('FeedbackResultSchema', () => {
  it('requires the exact six dimensions and exactly three review groups', () => {
    expect(FeedbackResultSchema.parse(validResult()).dimensions.map((item) => item.id)).toEqual(dimensionIds);
    expect(() => FeedbackResultSchema.parse({ ...validResult(), priorities: validResult().priorities.slice(0, 2) })).toThrow();
  });

  it('allows an explicitly insufficient dimension without inventing evidence', () => {
    const result = validResult();
    result.dimensions[3] = { ...result.dimensions[3]!, score: null as never, insufficientEvidence: true, evidenceTurnIds: [], assessment: '本场未充分验证', nextStep: '增加 Agent 评估案例练习。' };
    expect(FeedbackResultSchema.parse(result).dimensions[3]?.insufficientEvidence).toBe(true);
  });
});

describe('generateInterviewFeedback', () => {
  it('persists only evidence whose turn IDs exist and never emits a hiring verdict', async () => {
    const store = history();
    const model = { generate: vi.fn(async () => validResult()) };
    const result = await generateInterviewFeedback('session-1', { history: store, model, now: () => 10 });
    expect(result.dimensions).toHaveLength(6);
    expect(JSON.stringify(result)).not.toMatch(/录用|hire/i);
    expect(store.setFeedback).toHaveBeenLastCalledWith('session-1', expect.objectContaining({ status: 'completed', result }));
  });

  it('uses one repair retry for invented turn IDs', async () => {
    const invented = validResult(); invented.dimensions[0]!.evidenceTurnIds = ['invented'];
    const model = { generate: vi.fn().mockResolvedValueOnce(invented).mockResolvedValueOnce(validResult()) };
    await generateInterviewFeedback('session-1', { history: history(), model, now: () => 10 });
    expect(model.generate).toHaveBeenCalledTimes(2);
    expect(model.generate.mock.calls[1]?.[0]).toContain('修复');
  });

  it('rejects ineligible sessions and warns when transcript completeness is missing', async () => {
    const incomplete = detail(); incomplete.session.completeness = 'missing'; incomplete.session.hasTranscriptGap = true;
    const result = validResult(); (result as { missingTranscriptWarning: string | null }).missingTranscriptWarning = '部分转写缺失，评估可能不完整。';
    expect((await generateInterviewFeedback('session-1', { history: history(incomplete), model: { generate: vi.fn(async () => result) }, now: () => 10 })).missingTranscriptWarning).toContain('转写');
    const cancelled = detail(); cancelled.session.result = 'cancelled';
    await expect(generateInterviewFeedback('session-1', { history: history(cancelled), model: { generate: vi.fn() }, now: () => 10 })).rejects.toThrow('不能生成反馈');
  });
});
