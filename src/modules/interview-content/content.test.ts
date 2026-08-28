import { describe, expect, it } from 'vitest';

import { createContentSnapshot } from './content';

describe('createContentSnapshot', () => {
  it('removes excluded personal data and returns an immutable snapshot', () => {
    const source = {
      candidateProfile:
        '# 候选人画像\n\n姓名：张三\n电话：13800138000\n邮箱：zhangsan@example.com\n出生日期：2000-01-01\n住址：北京市\n\n## 技术能力\n- TypeScript 全栈开发',
      interviewBrief: 'Node.js 全栈 + AI Agent 面试说明',
    };

    const snapshot = createContentSnapshot(source);

    expect(snapshot.candidateProfile).toContain('TypeScript 全栈开发');
    expect(snapshot.candidateProfile).not.toMatch(
      /张三|13800138000|zhangsan@example\.com|2000-01-01|北京市/,
    );
    expect(() => {
      snapshot.candidateProfile = 'changed';
    }).toThrow();
  });

  it('uses a stable content version and SHA-256 of the canonical snapshot payload', () => {
    const first = createContentSnapshot({ candidateProfile: 'tech', interviewBrief: 'brief' });
    const second = createContentSnapshot({ candidateProfile: 'tech', interviewBrief: 'brief' });

    expect(first.version).toBe('2026-08-27');
    expect(first.hash).toBe('d9067d8943686c249cbfea2ea2c4ba09aede9d90ae0d6ffe0e2d62d1295e454b');
    expect(second).toEqual(first);
  });
});
