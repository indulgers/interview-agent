import 'server-only';

import { z } from 'zod';

const ServerEnv = z.object({
  DASHSCOPE_API_KEY: z.string().min(1),
  DASHSCOPE_WORKSPACE_ID: z.string().min(1),
  DATABASE_URL: z.string().default('file:./data/interview-agent.db'),
});

export type ServerEnv = z.infer<typeof ServerEnv>;

export function readServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const result = ServerEnv.safeParse(source);

  if (!result.success) {
    throw new Error('服务器配置不完整：请检查必填的服务端环境变量。');
  }

  return result.data;
}
