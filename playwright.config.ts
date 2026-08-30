import { defineConfig } from '@playwright/test';

const port = 3100;
const database = `/private/tmp/interview-agent-e2e-${process.pid}.db`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 35_000,
  use: {
    baseURL: `http://localhost:${port}`,
    permissions: ['microphone', 'camera'],
    launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: `NODE_ENV=test INTERVIEW_COMPILED_TEST_MODE=1 DASHSCOPE_API_KEY=e2e-placeholder DASHSCOPE_WORKSPACE_ID=e2e-workspace DATABASE_URL=file:${database} ./node_modules/.bin/next dev -p ${port}`,
    url: `http://localhost:${port}`,
    timeout: 60_000,
    reuseExistingServer: false,
  },
});
