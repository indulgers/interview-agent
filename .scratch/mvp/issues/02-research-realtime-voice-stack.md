# 调研实时语音技术路线

Type: research
Status: resolved
Blocked by:

## Question

在 2026 年的可用产品和 API 中，哪种实时语音技术路线最适合本机单用户 Web MVP，并能用最低集成复杂度支持中文、低延迟、双向打断、实时转写和服务端密钥保护？

## Answer

完整比较与官方来源见 [`docs/research/realtime-voice-stack.md`](../../../docs/research/realtime-voice-stack.md)。

- 在 API 支持地区内，首选 OpenAI Realtime：`gpt-realtime-2.1-mini` + 浏览器 WebRTC + 本地 Node.js unified session 初始化。长期密钥只在服务端，WebRTC 原生处理音频并支持 VAD 自动打断/截断，双方转写可用于历史记录；保留“结束回答”作为 VAD 降级。
- Gemini Live 是供应商备选，但浏览器需自行处理 PCM、播放缓冲、打断清空和会话恢复；默认 audio-only 上限正好为 15 分钟，MVP 复杂度更高。
- STT → 文本 LLM → TTS 只作架构保底，因为它需要自行协调三段流和打断状态，延迟及工程量最高。
- OpenAI 与 Gemini 的官方 API 可用地区当前均未列出中国大陆。若实际运行地是中国大陆，不能把上述方案当作已可用主路径，必须先补做国内供应商调研。
- 中文质量、打断停止延迟和单场成本没有可靠的官方场景基准，应通过 10–15 分钟真实技术面试语料 spike 验证并记录 usage。
