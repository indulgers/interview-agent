import { describe, expect, it, vi } from 'vitest';

import { BailianFeedbackModel } from './bailian-text-model';

describe('BailianFeedbackModel', () => {
  it('uses the Beijing workspace chat endpoint and strict JSON schema without exposing credentials', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }) }));
    const model = new BailianFeedbackModel({
      readEnv: () => ({ DASHSCOPE_API_KEY: 'secret-for-test', DASHSCOPE_WORKSPACE_ID: 'workspace-test', DATABASE_URL: 'file:test.db' }), fetch,
    });
    await expect(model.generate('生成 JSON 反馈')).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledWith('https://workspace-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions', expect.objectContaining({
      method: 'POST', headers: { authorization: 'Bearer secret-for-test', 'content-type': 'application/json' },
    }));
    const call = fetch.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe('qwen3.8-flash');
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { name: 'interview_feedback', strict: true } });
    expect(body).not.toHaveProperty('max_tokens');
  });

  it('sanitizes provider and malformed JSON failures', async () => {
    const model = new BailianFeedbackModel({ readEnv: () => ({ DASHSCOPE_API_KEY: 'secret-for-test', DASHSCOPE_WORKSPACE_ID: 'workspace-test', DATABASE_URL: 'file:test.db' }), fetch: vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) })) });
    await expect(model.generate('JSON')).rejects.toThrow('反馈模型返回无效');
    await expect(model.generate('JSON')).rejects.not.toThrow(/secret-for-test/);
  });
});
