# 实时语音技术路线调研

调研日期：2026-08-27

## 结论

如果应用的实际运行地区和 API 账号符合供应商的支持范围，MVP 首选 **OpenAI Realtime + 浏览器 WebRTC + 本地 Node.js 会话初始化接口**。浏览器把 SDP 发给本地服务端，服务端用环境变量中的长期 API key 调用 Realtime unified interface，再把 SDP answer 返回浏览器；长期密钥从不进入前端。使用 `gpt-realtime-2.1-mini` 起步，并把模型名做成服务端配置，以便用完整模型做中文技术面试质量对照。

这个选择的决定性优势不是模型参数，而是浏览器语音链路：OpenAI 官方建议浏览器客户端优先用 WebRTC；WebRTC 原生承载麦克风和远端音轨，VAD 检测到候选人开口时可取消回复，并由服务端自动截断未播放的模型音频。相比自己用 WebSocket 管理 PCM、播放队列和截断点，它更符合“最低集成复杂度”的目标。[OpenAI WebRTC 指南](https://developers.openai.com/api/docs/guides/realtime-webrtc)；[OpenAI 对话、打断与截断](https://developers.openai.com/api/docs/guides/realtime-conversations)

交互降级不需要切换供应商：保留“按住说话 / 结束回答”模式。官方 Realtime API 支持关闭 VAD 后显式提交输入和创建回复；这能在自动断句不稳定时保住可用性。[OpenAI push-to-talk 指南](https://developers.openai.com/api/docs/guides/realtime-conversations#push-to-talk)

供应商备选是 **Gemini Live + 浏览器 WebSocket + 服务端签发 ephemeral token**。它明确支持中文、barge-in 和双方转写，但浏览器要自行处理 16 kHz PCM、分块、播放缓冲、打断时清空缓冲，以及会话恢复；而且 15 分钟面试正好触及默认 audio-only session 上限，因此不如 WebRTC 路线稳妥。[Gemini Live 概览](https://ai.google.dev/gemini-api/docs/live-api)；[Gemini Live 能力与限制](https://ai.google.dev/gemini-api/docs/live-api/capabilities)

## 方案比较

| 方案 | 能力与中文 | 浏览器传输与鉴权 | 打断与转写 | 成本注意事项 | MVP 复杂度 |
| --- | --- | --- | --- | --- | --- |
| OpenAI Realtime 原生语音到语音 | `gpt-realtime-2.1-mini` 支持音频/文本输入输出，面向更快、更低成本的实时语音；输入转写支持 `zh-cn`、`cmn`、`yue` 等语言提示。官方没有公布该实时对话模型的逐语言质量基准，中文技术词和中英混说仍需实测。 | 浏览器使用 WebRTC。推荐 unified interface：浏览器只向本地 `/session` 发 SDP，本地 Node.js 用服务端 API key 初始化会话；也可改用服务端签发 client secret。 | VAD 下候选人开口会取消当前回复；WebRTC 自动截断未播放音频。AI 输出有 transcript delta/done；输入转写有 delta/completed，可带语言和技术词提示。 | mini 当前文本输入/输出为 $0.60/$2.40 每百万 token，音频输入/输出为 $10/$20 每百万 token。官方说明用户音频约 1 token/100 ms、助手音频约 1 token/50 ms，且每轮会重新携带会话历史，缓存会影响后续成本；应记录实际 usage，不能承诺固定单场价格。 | **中低，首选。** WebRTC 处理媒体传输和远端播放，本地服务端只负责会话初始化、配置与持久化。 |
| Gemini Live 原生语音到语音 | 官方列出中文 `zh`，支持原生音频对话、输入转写和输出转写。 | 浏览器直连有状态 WebSocket；长期 key 留在服务端，由服务端签发短期、可约束的 ephemeral token。该 token 功能仍标为 Preview。 | 用户开口时服务端发送 `interrupted=true`，但客户端必须立即丢弃未播放缓冲。双方转写均可开启。 | `gemini-3.1-flash-live-preview` 当前给出的音频等效价格为输入约 $0.005/分钟、输出约 $0.018/分钟；但官方说明历史原始音频会随每轮上下文重新计费，转写还会增加文本 token 费用，必须通过 context compression 和实测控制。 | **中。** 需采集/重采样 PCM、20–40 ms 分块、播放队列、打断清空、GoAway 和 session resumption。 |
| 可组合 STT → 文本 LLM → TTS | 可分别优化中文转写、面试推理和声音；文字是系统主状态，最容易审计和重放。 | 音频可经 WebRTC/WebSocket 到实时 STT，其余请求都从本地服务端发出，所有长期密钥留服务端。 | 实时 STT 可给 transcript delta；但应用必须自己取消文本生成、停止 TTS、清除旧音频并协调轮次，真正双向打断最难。 | 三段分别计费。例如 `gpt-live-transcribe` 当前为 $0.017/音频分钟，另加文本模型与 TTS；成本可拆分，但总价和首音延迟取决于三段。 | **高，仅作保底架构。** 控制力最高，但不适合第一版追求自然、低延迟对话。 |

来源：[GPT-Realtime-2.1 mini 模型与价格](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)；[OpenAI Realtime 成本机制](https://developers.openai.com/api/docs/guides/realtime-costs)；[OpenAI 实时转写](https://developers.openai.com/api/docs/guides/realtime-transcription)；[GPT Live Transcribe](https://developers.openai.com/api/docs/models/gpt-live-transcribe)；[Gemini ephemeral token](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens)；[Gemini 实时语音最佳实践](https://ai.google.dev/gemini-api/docs/live-api/best-practices)；[Gemini 定价](https://ai.google.dev/gemini-api/docs/pricing)。

## 推荐实现边界

MVP 的实时链路应保持为：

1. 浏览器向本地 Node.js `/session` 提交 WebRTC offer。
2. Node.js 从环境变量读取 OpenAI key，通过 unified interface 创建受服务端配置约束的会话。
3. 浏览器与 Realtime API 建立 WebRTC peer connection：麦克风是上行音轨，AI 声音是下行音轨，事件走 data channel。
4. 服务端会话配置固定中文面试指令、候选人画像、面试说明、约 15 分钟上限、输入转写和 VAD。
5. 前端将候选人最终转写和 AI 输出转写按 turn 暂存；结束后提交本地服务端写入 SQLite。音频不落盘。
6. 数字人的张嘴状态只跟随远端音轨的播放/音量状态，不接入独立数字人服务。

不为 MVP 增加 LiveKit、Daily、Agora 等媒体中间层。当前只有单个浏览器用户与一个模型端点，没有多人房间、电话接入或跨端媒体路由需求。

## 必须先验证的风险

### 1. 运行地区是架构门槛

OpenAI 官方 API 支持地区列表没有中国大陆，并明确说明在列表外访问或提供访问可能导致账号被阻止或暂停；Google Gemini API 的官方可用地区列表同样没有中国大陆。[OpenAI 支持地区](https://developers.openai.com/api/docs/supported-countries)；[Gemini API 可用地区](https://ai.google.dev/gemini-api/docs/available-regions)

因此，本推荐只在实际运行地与账号合法受支持时成立。不能把 VPN 或非官方转发当成产品方案。如果产品必须在中国大陆本机稳定、合规运行，架构选择前应新增国内供应商调研，比较其官方实时语音到语音能力；若没有同等原生能力，再采用国内流式 ASR + 文本 LLM + 流式 TTS 的组合链路。

### 2. 中文质量需要一次真实语料 spike

至少用 10–15 分钟真实设备录制/对话验证：普通话、Node.js/TypeScript/Redis/WebSocket/RAG/MCP 等中英术语、数字、缩写、候选人停顿、AI 说话时插话以及扬声器回声。验收指标应在会话编排票中确定，但至少记录首音延迟、打断停止延迟、空转写/错 turn、断线和单场 usage。

### 3. 历史文本不能直接等同于“实际听到的逐字稿”

OpenAI 官方说明，被打断时 WebRTC 会截断未播放音频，但不能生成精确对齐的截断文本。因此历史记录应将被打断的 AI turn 标记为 `interrupted`，不要宣称其文字与候选人实际听到的音频逐字一致。[OpenAI interruption and truncation](https://developers.openai.com/api/docs/guides/realtime-conversations#interruption-and-truncation)

## 最终建议

- **主路径（支持地区内）**：OpenAI Realtime，`gpt-realtime-2.1-mini`，浏览器 WebRTC，Node.js unified session 初始化，VAD 自动打断，输入/输出转写；手动结束回答作为交互降级。
- **供应商备选（支持地区内）**：Gemini Live。只有在中文自然度明显更好，且 15 分钟会话恢复与客户端 PCM 管线的额外复杂度可接受时采用。
- **中国大陆运行**：不直接采用上述任一主路径；先完成国内官方供应商调研，再做技术选型。
- **架构保底**：当原生语音模型的面试控制力或中文质量无法达标时，转为可组合 STT → 文本 LLM → TTS；接受更高延迟与状态管理成本。
