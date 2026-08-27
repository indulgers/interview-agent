# 中国大陆实时语音方案调研

日期：2026-08-27
范围：本机单用户浏览器 Web MVP；固定 45 分钟中文 Node.js 全栈与 AI Agent 模拟面试；不使用 VPN、代理或非官方转发。

## 结论

首选 **阿里云百炼 Qwen3.5-Omni-Realtime（华北 2 北京）+ 浏览器 WebRTC + 本机 Node.js 后端代理 SDP 鉴权**。

它是本次候选中最接近“一个模型完成听、想、说”的官方国内方案。官方明确提供 WebRTC、WebSocket 和 AOQ；其中 WebRTC 面向浏览器低延迟语音，使用 RTP/UDP 传音频，并内置回声消除与降噪。模型通过事件返回候选人输入转写和 AI 输出转写，服务端 VAD 检测到候选人重新开口时可以触发打断。北京地域可直接开通百炼 API Key，不依赖 OpenAI 账号。[Qwen-Omni-Realtime 使用文档](https://help.aliyun.com/zh/model-studio/realtime)

浏览器不能持有长期 API Key。WebRTC 建连的 SDP 请求要求 Bearer API Key，因此由本机 Node.js 后端接收浏览器 Offer、向百炼转发 SDP 交换、再把 Answer 返回浏览器。阿里云也明确要求不要在浏览器等客户端使用长期 Key；正式连接也可评估其临时 Key/AOQ 方式。[Realtime 鉴权说明](https://help.aliyun.com/en/model-studio/realtime-token-authentication)、[API Key 安全说明](https://help.aliyun.com/zh/model-studio/get-api-key/)

降级方案是 **阿里云组合链路：流式 ASR → 文本 Qwen → 流式 TTS**。建议使用北京地域 `paraformer-realtime-v2` 或 `fun-asr-realtime`、一个 Qwen Flash 文本模型，以及 `qwen3-tts-flash`。这条路线状态机和音频管线更复杂，但每一段可以单独替换、调试和持久化；当端到端模型的长会话上下文、技术词转写或面试官可控性达不到验收线时，它是最稳妥的同厂商回退。[语音识别模型](https://help.aliyun.com/zh/model-studio/asr-model/)、[百炼模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

## 需求匹配

| 要求 | Qwen3.5-Omni-Realtime | 组合链路 |
| --- | --- | --- |
| 中国大陆官方接入 | 北京地域 | 北京地域 |
| 浏览器低延迟 | 原生 WebRTC，匹配最好 | 浏览器音频需经 Node.js 编排，延迟更高 |
| 候选人打断 AI | 服务端 VAD/semantic VAD + 播放缓存清理 | 需要自行串联 VAD、取消 LLM/TTS、清播放队列 |
| 候选人转写 | `conversation.item.input_audio_transcription.*` | ASR 最终结果直接保存 |
| AI 转写 | `response.audio_transcript.*` | LLM 原始文本直接保存 |
| 密钥保护 | Node.js 代理 SDP；长期 Key 不进浏览器 | 全部云调用都在 Node.js |
| 45 分钟 | 单连接最长 120 分钟，但 Flash 上下文只保留最多 80 个音频轮次/480 秒音频；应用必须维护面试进度摘要 | Fun-ASR 实时音频标为不限；应用自行维护会话 |
| 实现复杂度 | 低到中 | 中到高 |
| 可控性 | 端到端自然，但内部阶段不可独立调参 | 每段可调，面试规则和文本更容易审计 |

阿里云的事件参考明确区分候选人最终输入转写与 AI 音频转写，满足只保存双方最终文字的历史模型；`semantic_vad` 还可过滤“嗯、啊”等无意义声音，降低错误打断概率。[Realtime 客户端事件](https://help.aliyun.com/zh/model-studio/client-events)、[Realtime 服务端事件](https://help.aliyun.com/zh/model-studio/server-events)

官方 Realtime 文档说明单次连接最长可保持 120 分钟；但 `qwen3.5-omni-flash-realtime` 的上下文上限还包括最多 80 个音频轮次和 480 秒音频，超出后较早历史会被丢弃。因此 45 分钟面试不能只依赖模型原生上下文：应用需要周期性维护并重新注入“已覆盖主题、关键证据、待追问项和当前阶段”的紧凑进度摘要，同时仍需用 50 分钟真实网络测试验证连接稳定性。[Qwen-Omni-Realtime 使用文档](https://help.aliyun.com/zh/model-studio/realtime)

WebRTC 模式只支持服务端 VAD/semantic VAD，不支持关闭 VAD 后由客户端手动提交音频。“结束回答”只能作为辅助：短暂静音本地麦克风，制造明确静音段以帮助服务端结束当前轮次；它不能被描述为绕过 VAD 的手动提交。若真实 PoC 仍无法可靠断句，则切换到应用自行控制轮次边界的组合链路。[Qwen-Omni-Realtime 使用文档](https://help.aliyun.com/zh/model-studio/realtime)

## 成本判断

Qwen3.5-Omni-Realtime 按输入、输出 Token 计费。北京地域 `qwen3.5-omni-flash-realtime` 当前刊例为：文本/图片输入 3.3 元/百万 Token、音频输入 27 元/百万 Token、文本输出 20 元/百万 Token、文本+音频输出 107 元/百万 Token；新开通有 100 万 Token、90 天有效的免费额度。实时语音历史会在后续轮次重复作为输入，轮次越多，成本越高，因此不能只用“45 分钟音频长度”给出可靠单场固定价。[百炼模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

组合链路的刊例更容易估算：`paraformer-realtime-v2` 为 0.00024 元/秒，45 分钟全程送入约 0.648 元；`qwen3-tts-flash` 为 0.8 元/万计费字符，文本模型另按 Token 计费。实际 TTS 只覆盖 AI 发言，ASR 也可以只按候选人有效发言送入，所以真实单场可能低于上述 ASR 全时长上界。[百炼模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)

第一版不要把刊例推算写成产品承诺。PoC 应在一轮 50 分钟完整测试中记录百炼控制台的真实单场用量，作为 MVP 初始预算依据；它不构成稳定成本分布的统计结论。

## 其他国内官方方案

### 火山引擎 RTC 对话式 AI

火山引擎提供 Web SDK、实时转写、自动/手动打断、ASR、LLM、TTS 和 RTC 的完整编排，国内接入成熟。它更像一套实时对话基础设施，而不是一个简单端到端 API；需要同时配置多个服务与计费项。官方示例刊例包含 RTC 纯音频 7 元/千分钟、对话式 AI 音频处理 9 元/千分钟，另加 ASR、LLM、TTS；示例中的 ASR 为 4.5 元/小时、TTS 为 5 元/万字符。[功能介绍](https://www.volcengine.com/docs/82379/1393085?lang=zh)、[计费说明](https://www.volcengine.com/docs/6348/1392584?lang=zh)

它适合作为跨厂商备选，尤其是后续需要更成熟 RTC 房间能力时；但对当前“本机单用户、一个核心功能”的 MVP，接入面比百炼 WebRTC 大。公开官方文档未给出本调研可确认的单任务 45 分钟上限，使用前同样需要长连接 PoC。

### 腾讯云 TRTC AI 实时对话

腾讯提供 Web 等多端 RTC SDK，并把实时语音识别、可配置 LLM、TTS 和打断封装为 AI 实时对话任务。它并非单模型 speech-to-speech，费用也拆为音频通话、AI 对话服务、ASR、TTS 和外部 LLM。AI 对话服务刊例为 0.01 元/分钟，其他项目另计。[AI 实时对话计费](https://cloud.tencent.com/document/product/647/115755)、[接入准备](https://cloud.tencent.com/document/product/647/116056)

能力满足，但对单用户 MVP 没有比百炼端到端 WebRTC 更简单；公开页未确认单任务最大时长。

### 百度智能云

百度同时提供端到端语音语言大模型 WebSocket API，以及 RTC 大模型互动框架。RTC 文档明确支持 Web/SDK 或 WebSocket、双工语音和插话打断；端到端接口也支持 VAD 与响应打断。[端到端语音语言大模型](https://cloud.baidu.com/doc/SPEECH/s/nmcytnwei)、[大模型互动快速集成](https://cloud.baidu.com/doc/RTC/s/Xm8y487ix)、[语音对话模式](https://cloud.baidu.com/doc/RTC/s/9mj8k5zat)

公开资料没有同时给出本项目需要的清晰 45 分钟连接限制与公开刊例价，部分 RTC 价格需咨询商务，因此不作为 MVP 首选。[大模型实时互动计费](https://cloud.baidu.com/doc/RTC/s/Ym8y3zcmt)

## 为什么不直接选择组合链路

组合链路的优势是可控：ASR 可以加技术词热词，LLM 只处理文本，TTS 可独立选择音色，任何一步失败都更容易定位。代价是应用必须自行实现并验证：

- VAD 与轮次结束判断；
- 候选人开口时同时取消 LLM、TTS 和浏览器已缓冲音频；
- 三个流的背压、序号和过期响应丢弃；
- 断线后的上下文重建；
- ASR、LLM、TTS 三套错误与计费状态。

这与“第一版只做好实时语音面试”的简化目标冲突，因此它应是明确的降级口，而不是起步架构。

## 必须先通过的 PoC 门槛

在写完整产品实现计划前，用真实简历内容和 Node.js/AI Agent 中英混说语料做三轮测试：

1. 连续运行 50 分钟，验证单连接、上下文和用量；如必须换连接，验证无重复提问的上下文续接。
2. 用电脑扬声器播放 AI 语音时直接开口，测量从候选人发声到 AI 停止出声的延迟。
3. 核对双方最终转写，重点覆盖 Node.js、NestJS、WebSocket、RAG、Tool Calling、MCP 等术语。
4. 模拟断网 5–15 秒，确认 Node.js 能重建连接，且 SQLite 已保存的最终轮次不丢失。
5. 从控制台记录每场实际费用；不以免费额度掩盖正式成本。

建议验收线：打断停止的主观感受不超过约 500 ms；普通轮次首个可听响应以 1.5 s 为目标；关键技术词最终转写准确率需在真实语料中达到可接受水平。它们是本项目的工程目标，不是厂商官方 SLA，最终阈值应由 PoC 数据决定。

## 最终决策

- **主路径**：Qwen3.5-Omni-Flash-Realtime，北京地域；浏览器 WebRTC；本机 Node.js 只负责密钥保护/SDP 代理、会话编排、最终转写入库和反馈生成。
- **模型升级口**：若 Flash 的面试追问质量不足，在相同协议下切换 Plus，不先改架构。
- **同厂商降级**：Paraformer/Fun-ASR Realtime → Qwen Flash 文本模型 → Qwen3-TTS-Flash。
- **跨厂商备选**：只有百炼 PoC 未通过时，再验证火山引擎 RTC 对话式 AI。
- **未解决的事实**：单一 WebRTC 连接 50 分钟稳定性、技术词中英混说质量、真实打断延迟和单场真实成本，必须用国内真实网络 PoC 决定。
