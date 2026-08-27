# 选定 MVP 架构与技术栈

Type: grilling
Status: resolved
Blocked by: 02, 03, 04, 05, 06, 09, 10

## Question

结合已确认的产品边界、实时语音调研、交互原型、会话状态和历史模型，MVP 应选择哪种整体架构、模块边界和开发技术栈？

## Answer

完整决策见 [AI 模拟面试 MVP 架构](../../../docs/architecture/mvp-architecture.md)。

采用 Next.js App Router + TypeScript 单体架构，浏览器使用 WebRTC 直连阿里云百炼 Qwen3.5 Omni Realtime，本机 Node.js 代理 SDP 鉴权并保护 Key，使用 Drizzle + SQLite 保存历史。核心行为集中在 `InterviewSession`、`RealtimeVoice`、`InterviewContent`、`InterviewHistory` 和 `InterviewFeedback` 五个深模块中。

`RealtimeVoice` 在真实供应商 seam 上提供百炼生产适配器和内存测试适配器；如果一轮 50 分钟国内真实网络 PoC 未通过，在同一 seam 后增加 ASR → Qwen 文本 → TTS 适配器，不改动页面、会话或历史模块。

## Comments

这个决策刻意不拆分独立前后端进程，也不为 SQLite 之上造只有一个生产适配器的假 Repository seam。模块的对外接口同时是业务测试表面。
