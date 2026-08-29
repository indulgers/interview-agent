import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Derived only from the server process mode at startup. A browser query or
  // user-provided public variable cannot turn the production adapter into a fake.
  env: { INTERVIEW_COMPILED_TEST_MODE: process.env.NODE_ENV === 'test' ? '1' : '0' },
};

export default nextConfig;
