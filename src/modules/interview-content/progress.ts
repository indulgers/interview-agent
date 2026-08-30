import type { InterviewPhase, InterviewProgress } from './types';

const MINUTE_MS = 60_000;

/** Return the budget phase for elapsed interview time. */
export function phaseAt(elapsedMs: number): InterviewPhase {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 5 * MINUTE_MS) return 'intro';
  if (elapsedMs < 20 * MINUTE_MS) return 'project';
  if (elapsedMs < 32 * MINUTE_MS) return 'fullstack';
  if (elapsedMs < 42 * MINUTE_MS) return 'agent';
  return 'wrapup';
}
export function createInitialProgress(): InterviewProgress {
  return {
    phase: 'intro',
    coveredTopics: [],
    evidence: [],
    pendingFollowUps: [],
    updatedThroughSequence: 0,
  };
}
