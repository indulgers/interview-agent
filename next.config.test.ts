import { describe, expect, it } from 'vitest';

import { createNextConfig } from './next.config';

describe('next configuration', () => {
  it('isolates the compiled interview test build without changing production output', () => {
    expect(createNextConfig(true)).toMatchObject({ distDir: '.next-e2e', env: { INTERVIEW_COMPILED_TEST_MODE: '1' } });
    expect(createNextConfig(false)).toMatchObject({ env: { INTERVIEW_COMPILED_TEST_MODE: '0' } });
    expect(createNextConfig(false).distDir).toBeUndefined();
  });
});
