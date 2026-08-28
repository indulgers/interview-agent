import { describe, expect, it } from 'vitest';

import { createContentSnapshot } from './content';
import { buildRealtimeInstructions } from './instructions';
import { createInitialProgress } from './progress';

describe('buildRealtimeInstructions', () => {
  it('sets verification-only interview rules without coaching or hiring verdicts', () => {
    const instructions = buildRealtimeInstructions(createContentSnapshot(), createInitialProgress());

    expect(instructions).toContain('claims are unverified');
    expect(instructions).toContain('不得教学');
    expect(instructions).toContain('不得提供答案提示');
    expect(instructions).toContain('不得作出招聘或录用结论');
  });

  it('serializes covered topics, evidence, pending follow-ups, phase, and sequence for reconnection', () => {
    const progress = {
      phase: 'agent' as const,
      coveredTopics: ['项目职责', '流式响应'],
      evidence: [{ claim: '负责 Agent 面板', observation: '描述了上下文截断', turnIds: ['turn-7'] }],
      pendingFollowUps: ['追问失败恢复'],
      updatedThroughSequence: 7,
    };

    const instructions = buildRealtimeInstructions(createContentSnapshot(), progress);

    expect(instructions).toContain('phase=agent');
    expect(instructions).toContain('covered_topics=项目职责；流式响应');
    expect(instructions).toContain('负责 Agent 面板：描述了上下文截断 [turn-7]');
    expect(instructions).toContain('pending_follow_ups=追问失败恢复');
    expect(instructions).toContain('updated_through_sequence=7');
  });
});
