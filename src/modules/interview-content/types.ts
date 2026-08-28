export type InterviewPhase = 'intro' | 'project' | 'fullstack' | 'agent' | 'wrapup';

export interface InterviewProgress {
  phase: InterviewPhase;
  coveredTopics: string[];
  evidence: Array<{ claim: string; observation: string; turnIds: string[] }>;
  pendingFollowUps: string[];
  updatedThroughSequence: number;
}

export interface ContentSnapshot {
  version: string;
  hash: string;
  candidateProfile: string;
  interviewBrief: string;
}

export interface ContentSource {
  candidateProfile?: string;
  interviewBrief?: string;
}
