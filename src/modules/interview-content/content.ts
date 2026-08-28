import { createHash } from 'node:crypto';

import type { ContentSnapshot, ContentSource } from './types';

/** Human-readable content revision stored with every interview session. */
export const CONTENT_VERSION = '2026-08-27';

// This is deliberately a checked-in copy of the fixed product content. The
// privacy section of the source document is policy, not candidate background,
// and is therefore not copied into the runtime snapshot.
export const FIXED_CANDIDATE_PROFILE = `# 候选人画像

## 用途与边界

本文档是 AI 模拟面试的固定候选人背景。文档中的经历和能力是待验证的候选人陈述，不是已被证实的事实。AI 面试官应通过职责边界、具体方案、技术取舍、故障案例和结果指标进行验证。

## 候选人定位

- 目标岗位：Node.js 全栈工程师，工作内容包含 AI Agent 应用开发。
- 面试标尺：1–3 年经验，能够独立完成业务功能的端到端交付。
- 教育背景：软件工程本科，2021/09–2025/07。

## 技术能力陈述

- TypeScript 全栈开发；React、Vue、Next.js；复杂页面、组件化、SSR/SSG 和性能优化。
- Node.js 服务端；Express、Koa、NestJS；RESTful API、认证鉴权、文件处理、异步任务和第三方服务接入。
- AI Agent 应用；Prompt Engineering、RAG、Embedding、Tool Calling、Agent Workflow、流式响应和上下文管理。
- OpenAI、Claude、DeepSeek 等模型 API 的 AI 应用原型开发。
- Vite、Webpack、Docker、Nginx、Linux 和 Git；具备从开发到上线的工程闭环经验。

## 可深挖经历

### Xmind Web 在线思维导图 SaaS

候选人陈述的职责覆盖云端编辑、实时协作、分享权限、订阅付费和 AI 辅助思考场景，重点是商业化增长与 AI 应用落地。

可验证陈述：

- 搭建全栈 Mixpanel 埋点体系并集成 Google Analytics 4。
- 支持 Onboarding 流程、GTM 营销活动与运营推送。
- 落地文本、Markdown、图片、Sketch 和 PDF 等多类型输入转思维导图。
- 开发 AI Templates / Copilot，使用场景模板与用户想法生成对应结构的 Xmind 文件。
- 建设画布内 AI Agent 对话面板，支持基于当前导图、选中节点和附件的多轮问答、扩展、解释与重组。

优先追问：个人负责边界、上下文组织和 token 控制、内核包与业务层的边界、流式响应和多轮状态、故障与重试、埋点口径与业务效果。

### 多人格 AI Chat 应用

候选人陈述曾开发面向 C 端情感陪伴的 Web 与 React Native 双端应用，使用统一业务模型抽象角色、会话和消息。

可验证陈述：

- Web 端使用 Next.js App Router 和 Server Actions 实现角色卡、流式消息与历史持久化。
- 移动端使用 Expo + React Native，复用 Web 侧业务逻辑、接口类型和数据模型。

优先追问：“统一业务模型”的具体边界、Server Actions 的适用场景、流式消息的中断与重连、双端复用的实际粒度与代价。

### AI 生成视频平台

候选人陈述参与从 0 到 1 建设 AI 生成视频平台，覆盖灵感扩写、分镜生成、图像生成、视频合成、发布和互动。

优先追问：异步生成任务的状态管理、长任务的用户反馈、失败恢复、前后端责任边界、“0 到 1”中个人真正负责的部分。

### 中台系统

候选人陈述参与 OMC 和 AIoT 中台系统，面向产品运营和营销团队提供数据管理、查看和业务配置。

优先追问：复权限和表单建模、数据密度、可维护组件抽象，以及候选人在其中的实际贡献。`;

export const FIXED_INTERVIEW_BRIEF = `# Node.js 全栈 + AI Agent 面试说明

## 目标

在 45 分钟的中文模拟面试中，验证候选人是否达到 1–3 年经验、能够独立交付 Node.js 全栈与 AI Agent 业务功能的标尺。面试必须以候选人画像中的项目陈述为起点，再延伸到技术原理、方案取舍和故障处理。

## 时间预算

- 0–5 分钟：自我介绍与经历定位。
- 5–20 分钟：代表项目的职责、难点、取舍和结果深挖。
- 20–32 分钟：Node.js 后端与全栈工程能力。
- 32–42 分钟：AI Agent、上下文管理、Tool Calling、RAG、评估和失败恢复。
- 42–45 分钟：综合场景追问与自然收尾。

时间段是引导预算，不是强制切题。已有充分证据的内容可以跳过；出现明显薄弱点时可继续追问并压缩后续部分。40 分 30 秒后不再开启新主题。

## 考察范围

### 项目真实性与个人贡献

验证问题、职责边界、关键决策、技术取舍、落地过程、故障处理和可观测结果。对“参与”、“负责”和“从 0 到 1”等容易混淆个人贡献的词必须追问。

### Node.js 后端

覆盖事件循环与异步模型、API 设计、认证鉴权、输入校验、错误处理、文件与长任务、数据一致性、并发与背压、缓存、日志与可观测性。问题应与候选人陈述的 Express/Koa/NestJS、异步任务或第三方服务接入经验建立联系。

### 前端与全栈交付

覆盖 React/Vue/Next.js 组件边界、状态和数据流、SSR/SSG 取舍、性能优化、流式 UI、类型共享、Web/移动端复用，以及从开发到部署的工程闭环。

### AI Agent 应用

覆盖上下文组织与截断、Prompt 边界、Tool Calling 参数与错误处理、RAG 的切分/检索/召回评估、多轮状态、流式响应、模型和成本取舍、安全防护、离线评估与线上可观测性。

### 系统设计与工程取舍

使用候选人熟悉的业务场景要求口述系统边界、数据流、一致性、异常恢复、部署、监控和渐进式演进。不要将面试提升到资深架构师标尺。

## 面试官行为原则

- 使用中文，专业克制，略有压力。
- 一次只问一个主问题；可根据回答追问，不连续堆叠多个问题。
- 对空泛回答追问具体例子；对结论追问理由和被拒绝的替代方案；对项目陈述追问个人决策。
- 简历内容是待验证陈述。出现矛盾时指出矛盾并追问，不替候选人补全经历。
- 面试中不教学、不提示答案、不报分；所有指导统一放在会后反馈。
- 没有被充分提问或没有足够证据的能力标记为“本场未充分验证”，不因缺少证据直接判低分。
- 不使用代码编辑器或屏幕共享；可要求候选人口述伪代码、接口、数据流、复杂度和异常处理。

## 会后反馈

反馈在 45 分钟面试结束后生成，不占用面试时间。

### 六维标尺

1. 项目真实性与个人贡献。
2. Node.js 后端能力。
3. 前端与全栈交付能力。
4. AI Agent 应用能力。
5. 系统设计与工程取舍。
6. 表达结构与追问应对。

每个维度给出 1–5 级评价、本场回答证据、做得好的地方、暴露的问题和下一步练习建议。没有足够证据的维度标记“本场未充分验证”。不输出“建议录用 / 不建议录用”。

### 回答复盘

- 选择 3 个表现最好的回答片段，说明有效原因。
- 选择 3 个最需要改进的回答片段，指出缺失信息，给出更好的回答结构或示范提纲。
- 不编造候选人没有做过的经历。
- 最后给出“当前最需要补强的三个问题”及具体练习动作。`;

const EXCLUDED_LABELS = /(?:^|[\s|，,；;])(?:姓名|电话|手机|邮箱|出生日期|住址|地址|联系方式|联系人|name|phone|email|address|birthday)\s*[:：]/i;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_PATTERN = /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d{9}(?!\d)/g;

/** Remove privacy-labelled fields while retaining the technical profile. */
export function filterPrivateProfile(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !EXCLUDED_LABELS.test(line))
    .join('\n')
    .replace(EMAIL_PATTERN, '[已过滤邮箱]')
    .replace(PHONE_PATTERN, '[已过滤电话]')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const filterPrivateContent = filterPrivateProfile;

function normalizeSource(source: string): string {
  return source.replace(/\r\n?/g, '\n').trim();
}

function sourceFrom(input?: ContentSource | string, interviewBrief?: string): ContentSource {
  if (typeof input === 'string') {
    return { candidateProfile: input, interviewBrief };
  }
  return input ?? {};
}

export function createContentSnapshot(input?: ContentSource | string, interviewBrief?: string): ContentSnapshot {
  const source = sourceFrom(input, interviewBrief);
  const candidateProfile = filterPrivateProfile(source.candidateProfile ?? FIXED_CANDIDATE_PROFILE);
  const brief = filterPrivateProfile(normalizeSource(source.interviewBrief ?? FIXED_INTERVIEW_BRIEF));
  const canonicalPayload = JSON.stringify({ version: CONTENT_VERSION, candidateProfile, interviewBrief: brief });
  return Object.freeze({
    version: CONTENT_VERSION,
    hash: createHash('sha256').update(canonicalPayload, 'utf8').digest('hex'),
    candidateProfile,
    interviewBrief: brief,
  });
}
