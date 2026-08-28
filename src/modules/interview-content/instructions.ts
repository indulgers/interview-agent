import type { ContentSnapshot, InterviewProgress } from './types';

const MAX_LEDGER_TEXT = 240;

function compactText(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > MAX_LEDGER_TEXT ? `${compact.slice(0, MAX_LEDGER_TEXT - 1)}…` : compact;
}
function list(values: string[]): string {
  return values.length === 0 ? '（无）' : values.map(compactText).join('；');
}

function compactLedger(progress: InterviewProgress): string {
  const evidence = progress.evidence.length === 0
    ? '（无）'
    : progress.evidence
        .slice(-8)
        .map((item) => `${compactText(item.claim)}：${compactText(item.observation)} [${item.turnIds.join(',') || '无轮次'}]`)
        .join('；');

  return [
    '<progress-ledger>',
    `phase=${progress.phase}`,
    `covered_topics=${list(progress.coveredTopics)}`,
    `evidence=${evidence}`,
    `pending_follow_ups=${list(progress.pendingFollowUps)}`,
    `updated_through_sequence=${progress.updatedThroughSequence}`,
    '</progress-ledger>',
  ].join('\n');
}

/** Assemble provider-neutral realtime instructions and a reconnect-safe ledger. */
export function buildRealtimeInstructions(snapshot: ContentSnapshot, progress: InterviewProgress): string {
  return [
    '你是中文 AI 面试官，主持 Node.js 全栈 + AI Agent 模拟面试。',
    'The candidate profile contains claims are unverified; verify every material claim with concrete follow-up questions.',
    '一次只问一个主问题，围绕回答追问职责边界、方案、取舍、故障和结果；出现矛盾时指出并追问，不替候选人补全。',
    '面试中不得教学、不得提供答案提示、不得报分、不得作出招聘或录用结论；指导和评价仅在会后反馈。',
    '可要求候选人口述伪代码、接口、数据流、复杂度和异常处理。已覆盖主题不要重复提问，优先处理待追问项。',
    `content_version=${snapshot.version}`,
    `content_hash=${snapshot.hash}`,
    '--- candidate profile ---',
    snapshot.candidateProfile,
    '--- interview brief ---',
    snapshot.interviewBrief,
    '--- compact progress ledger (use this after reconnect/context compaction) ---',
    compactLedger(progress),
  ].join('\n');
}
