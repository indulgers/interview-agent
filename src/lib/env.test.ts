import { describe, expect, it } from 'vitest';

import { readServerEnv } from './env';

describe('readServerEnv', () => {
  it('rejects a missing DashScope API key without revealing supplied secrets', () => {
    const workspaceId = 'workspace-for-test';
    const secret = 'secret-that-must-never-appear';

    expect(() =>
      readServerEnv({
        DASHSCOPE_API_KEY: '',
        DASHSCOPE_WORKSPACE_ID: workspaceId,
        DATABASE_URL: 'file:./test.db',
        UNRELATED_SECRET: secret,
      }),
    ).toThrow('服务器配置不完整');

    try {
      readServerEnv({
        DASHSCOPE_API_KEY: '',
        DASHSCOPE_WORKSPACE_ID: workspaceId,
        UNRELATED_SECRET: secret,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
      expect(String(error)).not.toContain(workspaceId);
    }
  });

  it('rejects a missing workspace ID with a safe configuration error', () => {
    expect(() =>
      readServerEnv({
        DASHSCOPE_API_KEY: 'key-for-test',
        DASHSCOPE_WORKSPACE_ID: '',
      }),
    ).toThrow('服务器配置不完整');
  });

  it('parses valid values and applies the local database default', () => {
    expect(
      readServerEnv({
        DASHSCOPE_API_KEY: 'key-for-test',
        DASHSCOPE_WORKSPACE_ID: 'workspace-for-test',
      }),
    ).toEqual({
      DASHSCOPE_API_KEY: 'key-for-test',
      DASHSCOPE_WORKSPACE_ID: 'workspace-for-test',
      DATABASE_URL: 'file:./data/interview-agent.db',
    });
  });
});
