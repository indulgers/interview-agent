import { describe, expect, it } from 'vitest';

import { createInitialProgress, phaseAt } from './progress';

describe('InterviewProgress', () => {
  it('maps the exact 45-minute budget boundaries to five interview phases', () => {
    const minute = 60_000;

    expect(phaseAt(0)).toBe('intro');
    expect(phaseAt(5 * minute - 1)).toBe('intro');
    expect(phaseAt(5 * minute)).toBe('project');
    expect(phaseAt(20 * minute)).toBe('fullstack');
    expect(phaseAt(32 * minute)).toBe('agent');
    expect(phaseAt(42 * minute)).toBe('wrapup');
    expect(phaseAt(45 * minute)).toBe('wrapup');
  });

  it('creates independent empty progress memory at the start of a session', () => {
    const first = createInitialProgress();
    const second = createInitialProgress();

    expect(first).toEqual({
      phase: 'intro',
      coveredTopics: [],
      evidence: [],
      pendingFollowUps: [],
      updatedThroughSequence: 0,
    });
    first.coveredTopics.push('项目职责');
    expect(second.coveredTopics).toEqual([]);
  });
});
