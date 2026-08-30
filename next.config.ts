import type { NextConfig } from 'next';

export function createNextConfig(compiledTestMode: boolean): NextConfig {
  return {
    // Derived only from the server process mode at startup. A browser query or
    // user-provided public variable cannot turn the production adapter into a fake.
    env: { INTERVIEW_COMPILED_TEST_MODE: compiledTestMode ? '1' : '0' },
    typescript: { tsconfigPath: compiledTestMode ? 'tsconfig.e2e.json' : 'tsconfig.json' },
    ...(compiledTestMode ? { distDir: '.next-e2e' } : {}),
  };
}

const nextConfig = createNextConfig(process.env.INTERVIEW_COMPILED_TEST_MODE === '1');

export default nextConfig;
