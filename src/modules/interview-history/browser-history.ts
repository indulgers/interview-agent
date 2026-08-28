'use client';

import type { FinalTurn, InterviewHistory, StartSession } from './types';

async function call<T>(operation: string, input: unknown): Promise<T> {
  const response = await fetch('/api/interviews/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ operation, input }),
  });
  if (!response.ok) throw new Error('面试记录保存失败');
  return (await response.json()) as T;
}

export function createBrowserInterviewHistory(): InterviewHistory {
  return {
    start: (input: StartSession) => call<string>('start', input),
    appendFinalTurn: (input: FinalTurn) => call<'inserted' | 'duplicate'>('append', input),
    finish: (id, result, completeness, actualDurationMs) => call<void>('finish', { id, result, completeness, actualDurationMs }),
    setFeedback: (id, update) => call<void>('setFeedback', { id, update }),
    list: () => call('list', null), detail: (id) => call('detail', { id }), delete: (id) => call('delete', { id }),
    recoverAbandoned: () => call('recover', null),
  };
}
