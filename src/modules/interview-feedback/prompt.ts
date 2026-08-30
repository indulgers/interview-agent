import type { SessionDetail } from '../interview-history/types';

export function buildFeedbackPrompt(detail: SessionDetail) {
  const turns = detail.turns.map((turn) => ({ id: turn.id, speaker: turn.speaker, text: turn.text, hasGap: turn.hasGap }));
  return `你是 Node.js 全栈 + AI Agent 模拟面试的评估员。
只根据给定的最终转写评估，不要补全候选人没说过的经历，不得给出录用建议。
必须返回严格 JSON：按 project_ownership、node_backend、frontend_delivery、ai_agent、system_design、communication 顺序输出六个维度。
有证据时评 1–5 分并引用真实 turn id；证据不足时 score=0（服务端会规范化为未评分）、insufficientEvidence=true、evidenceTurnIds=[]、assessment=“本场未充分验证”。
另外给出恰好 3 个 strengths、3 个 weakMoments 和 3 个 priorities。
转写有缺失时 missingTranscriptWarning 必须是明确中文警告，否则为空字符串（服务端会规范化为 null）。

面试标准：
${detail.snapshot.interviewBrief}

最终转写（id 是唯一允许的证据引用）：
${JSON.stringify(turns)}`;
}

export function buildRepairPrompt(base: string, reason: string) {
  return `${base}\n\n上一次输出无效。修复且只返回完整 JSON。问题：${reason}`;
}
