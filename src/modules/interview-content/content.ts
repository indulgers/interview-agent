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

- 使用中文，专业克制且略有压力。
- 一次只问一个主问题；可根据回答追问，不连续堆叠多个问题。
- 对空泛回答追问具体例子；对结论追问理由和被拒绝的替代方案；对项目陈述追问个人决策。
- 简历内容是待验证陈述。出现矛盾时指出矛盾并追问，不替候选人补全经历。
- 面试中不教学、不提示答案、不报分；所有指导统一放在会后反馈。
- 没有被充分提问或没有足够证据的能力标记为“本场未充分验证”，不因缺少证据直接判低分。
- 不使用代码编辑器或屏幕共享；可要求候选人口述伪代码、接口、数据流、复杂度和异常处理。

## 会后反馈

反馈在 45 分钟面试结束后生成，不占用面试时间。反馈不得替代面试中的追问，也不在面试中提供答案、评分或任何录用结论。

反馈应按以下六个维度给出 1–5 级评价，并引用本场证据：项目真实性与个人贡献、Node.js 后端能力、前端与全栈交付能力、AI Agent 应用能力、系统设计与工程取舍、表达结构与追问应对。没有足够证据的维度标记“本场未充分验证”。

回答复盘选择 3 个表现最好的回答片段和 3 个最需要改进的回答片段，并给出 3 个当前最需要补强的问题及具体练习动作；不编造候选人没有做过的经历。`;

const EXCLUDED_LABELS = /姓名|电话|手机|邮箱|出生日期|住址|地址|联系方式/;

/** Remove privacy-labelled fields while retaining the technical profile. */
export function filterPrivateProfile(source: string): string {
  return source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !EXCLUDED_LABELS.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeSource(source: string): string {
  return source.replace(/\r\n?/g, '\n').trim();
}

function sourceFrom(input?: ContentSource | string, interviewBrief?: string): ContentSource {
  if (typeof input === 'string') {
    return { candidateProfile: input, interviewBrief };
  }
  return input ?? {};
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  for (let index = 0; index < 8; index += 1) {
    padded[padded.length - 1 - index] = (bitLength / 2 ** (index * 8)) & 0xff;
  }

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      words[index] = ((padded[position] << 24) | (padded[position + 1] << 16) | (padded[position + 2] << 8) | padded[position + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const valueA = words[index - 15];
      const valueB = words[index - 2];
      const sigma0 = (rotateRight(valueA, 7) ^ rotateRight(valueA, 18) ^ (valueA >>> 3)) >>> 0;
      const sigma1 = (rotateRight(valueB, 17) ^ rotateRight(valueB, 19) ^ (valueB >>> 10)) >>> 0;
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25)) >>> 0;
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choice + SHA256_K[index] + words[index]) >>> 0;
      const sigma0 = (rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22)) >>> 0;
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, '0')).join('');
}

export function createContentSnapshot(input?: ContentSource | string, interviewBrief?: string): ContentSnapshot {
  const source = sourceFrom(input, interviewBrief);
  const candidateProfile = filterPrivateProfile(source.candidateProfile ?? FIXED_CANDIDATE_PROFILE);
  const brief = normalizeSource(source.interviewBrief ?? FIXED_INTERVIEW_BRIEF);
  const canonicalPayload = JSON.stringify({ version: CONTENT_VERSION, candidateProfile, interviewBrief: brief });
  return Object.freeze({
    version: CONTENT_VERSION,
    hash: sha256(canonicalPayload),
    candidateProfile,
    interviewBrief: brief,
  });
}
