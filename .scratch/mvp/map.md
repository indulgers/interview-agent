# AI 模拟面试 MVP 决策地图

## Destination

产出一份经用户确认、可直接转入实现计划的 MVP 设计规格和任务清单，覆盖实时语音、轻量数字人、候选人画像、面试编排、会后反馈与本地历史记录。

## Notes

- 产品领域语言以 [`CONTEXT.md`](../../CONTEXT.md) 为准。
- 开发流程：Wayfinder → `grill-with-docs` → 规格 → 实现计划 → TDD 实现 → Spec/Standards 双轴 Review。
- 用户指定的简历是固定候选人背景，不建设简历上传功能。
- 本地 Markdown 是本 effort 的 issue tracker。
- Wayfinder 本身产出决策和规格，不提前实现产品代码。

## Decisions so far

- [定义产品目标与 MVP 边界](issues/01-define-product-boundary.md) — 本机单用户的 45 分钟中文 AI 模拟面试，聚焦实时语音、简历驱动追问、轻量数字人和文本历史。
- [实时语音技术路线](issues/02-research-realtime-voice-stack.md) — 支持地区内首选 OpenAI Realtime WebRTC + Node.js 服务端会话初始化，Gemini Live 作备选，串联语音管线作保底；中国大陆运行需先补国内供应商调研。
- [确定面试房间交互与数字人表现](issues/03-prototype-interview-room.md) — 采用沉浸式面试官主舞台，候选人画中画，状态、当前问题和通话控件作为轻量覆盖层。
- [定义实时面试的会话状态与异常恢复](issues/04-define-session-orchestration.md) — 麦克风与摄像头均为必需；会话固定 45 分钟，支持打断、软收尾、暂停重试和可区分的完成/中断/取消结果。
- [定义面试内容、追问原则与反馈标尺](issues/05-define-interview-content-and-feedback.md) — 使用固定候选人画像和 45 分钟面试说明，以项目声明验证为起点，延伸至 Node.js/全栈/AI Agent，并生成基于证据的六维反馈。
- [定义历史记录与内容版本模型](issues/06-define-history-model.md) — 会话和最终转写逐步持久化，保存不可变内容快照；反馈状态独立且可重试，历史默认永久保留并可删除单场。
- [确认运行地区与实时语音 API 可用性](issues/09-confirm-api-region-and-access.md) — 应用必须在中国大陆网络运行，且无 OpenAI API 账号；OpenAI Realtime 不作为主路径，架构选定前须完成国内方案调研。
- [中国大陆实时语音主路径](issues/10-research-mainland-realtime-voice.md) — 采用百炼 Qwen3.5-Omni-Flash-Realtime（北京）+ 浏览器 WebRTC + Node.js SDP 鉴权代理；组合式 ASR→Qwen→TTS 为降级路径，火山 RTC 仅作跨厂商备选。
- [选定 MVP 架构与技术栈](issues/07-select-architecture.md) — 采用 Next.js/TypeScript 单体、百炼 WebRTC、Drizzle/SQLite 和五个深模块；供应商适配隔离在 RealtimeVoice seam 后。
- [编写并确认 MVP 设计规格](issues/08-write-approved-mvp-spec.md) — 已整合全部产品与技术决策，完成自检并获得用户明确批准，可转入实现计划。

## Not yet specified

- 百炼主路径需在实现计划前置 spike 中完成一轮 50 分钟国内真实网络 PoC，实测长连接/续接、中英技术词最终转写、首音延迟、打断停止延迟和单场成本；Flash 原生上下文不足以覆盖 45 分钟，应用维护并重注入面试进度摘要；“结束回答”仅以短暂静音辅助服务端 VAD，仍不可靠时切换同厂商组合链路。

## Out of scope

- 真实面试中的回答辅助或提示。
- 登录、注册、多用户、付费和权限系统。
- 简历上传、题库、课程与内容管理。
- 候选人视频上传、录像、表情或肢体分析。
- 音频和视频历史回放。
- 3D 数字人、照片级真人生成和精确音素级唇形。
- 公网部署和云端数据库。
- 以实时转写为主视图的 C 端面试工作台（保留为后续产品方向）。
- 代码编辑器、屏幕共享和现场 Coding 页面；技术题只通过语音口述伪代码与设计思路。
