import 'server-only';

import type { ServerEnv } from '../../lib/env';
import { readServerEnv } from '../../lib/env';
import type { FeedbackModel } from './schema';

const MODEL = 'qwen3.8-flash';
const workspace = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$/;

const text = { type: 'string', minLength: 1, maxLength: 2000 } as const;
const dimension = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', enum: ['project_ownership', 'node_backend', 'frontend_delivery', 'ai_agent', 'system_design', 'communication'] },
    score: { type: 'integer', minimum: 0, maximum: 5 },
    insufficientEvidence: { type: 'boolean' },
    evidenceTurnIds: { type: 'array', items: { type: 'string' }, maxItems: 12 },
    assessment: text, nextStep: text,
  },
  required: ['id', 'score', 'insufficientEvidence', 'evidenceTurnIds', 'assessment', 'nextStep'],
};
const evidence = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const feedbackJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    dimensions: { type: 'array', minItems: 6, maxItems: 6, items: dimension },
    strengths: { type: 'array', minItems: 3, maxItems: 3, items: evidence({ turnId: { type: 'string' }, title: text, reason: text }) },
    weakMoments: { type: 'array', minItems: 3, maxItems: 3, items: evidence({ turnId: { type: 'string' }, title: text, missing: text, betterOutline: text }) },
    priorities: { type: 'array', minItems: 3, maxItems: 3, items: evidence({ title: text, action: text }) },
    missingTranscriptWarning: { type: 'string' },
  },
  required: ['dimensions', 'strengths', 'weakMoments', 'priorities', 'missingTranscriptWarning'],
};

type FetchResponse = { ok: boolean; json(): Promise<unknown> };
type Dependencies = {
  readEnv?: () => ServerEnv;
  fetch?: (input: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<FetchResponse>;
};

export class BailianFeedbackModel implements FeedbackModel {
  constructor(private readonly dependencies: Dependencies = {}) {}

  async generate(prompt: string): Promise<unknown> {
    try {
      const env = (this.dependencies.readEnv ?? readServerEnv)();
      if (!workspace.test(env.DASHSCOPE_WORKSPACE_ID)) throw new Error('invalid workspace');
      const response = await (this.dependencies.fetch ?? globalThis.fetch)(
        `https://${env.DASHSCOPE_WORKSPACE_ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${env.DASHSCOPE_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'system', content: '返回严格 JSON 面试反馈。' }, { role: 'user', content: prompt }],
            response_format: { type: 'json_schema', json_schema: { name: 'interview_feedback', strict: true, schema: feedbackJsonSchema } },
          }),
        },
      );
      if (!response.ok) throw new Error('provider failure');
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error('empty content');
      return normalizeProviderResult(JSON.parse(content) as unknown);
    } catch {
      throw new Error('反馈模型返回无效结果。');
    }
  }
}

function normalizeProviderResult(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const result = value as { dimensions?: Array<{ score?: unknown }>; missingTranscriptWarning?: unknown };
  result.dimensions?.forEach((dimension) => { if (dimension.score === 0) dimension.score = null; });
  if (result.missingTranscriptWarning === '') result.missingTranscriptWarning = null;
  return result;
}
