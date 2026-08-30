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

  it('matches the standard SHA-256 digest for a Unicode multi-block snapshot payload', () => {
    const candidateProfile = '候选人🤖'.repeat(200);
    const interviewBrief = '说明：Node.js 全栈。'.repeat(200);
    const snapshot = createContentSnapshot({ candidateProfile, interviewBrief });

    expect(snapshot.hash).toBe('2bf7555cc7fa9f76d30f76057776dce6b718bbc1de9b23bed0d8ca657478b756');
  });

  it('filters labelled and obvious contact data from both snapshot source fields', () => {
    const snapshot = createContentSnapshot({
      candidateProfile: '技术：Node.js\n邮箱: candidate@example.com\n手机: 13800138000\n保留 TypeScript',
      interviewBrief: '面试说明\n联系人：candidate@example.com\n电话：+86 13800138000\n一次只问一个主问题',
    });

    expect(snapshot.candidateProfile).toContain('保留 TypeScript');
    expect(snapshot.interviewBrief).toContain('一次只问一个主问题');
    expect(snapshot.candidateProfile).not.toMatch(/candidate@example\.com|13800138000/);
    expect(snapshot.interviewBrief).not.toMatch(/candidate@example\.com|13800138000/);
  });

  it('retains the complete feedback guidance in the fixed interview brief', () => {
    const snapshot = createContentSnapshot();

    expect(snapshot.interviewBrief).toContain('每个维度给出 1–5 级评价、本场回答证据、做得好的地方、暴露的问题和下一步练习建议');
    expect(snapshot.interviewBrief).toContain('更好的回答结构或示范提纲');
    expect(snapshot.interviewBrief).toContain('当前最需要补强的三个问题');
    expect(snapshot.interviewBrief).toContain('不输出“建议录用 / 不建议录用”');
  });
});
