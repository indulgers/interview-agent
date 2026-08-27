# 调研中国大陆实时语音方案

Type: research
Status: resolved
Blocked by: 09

## Question

在中国大陆官方可用的产品与 API 中，哪种方案最适合本机单用户浏览器 Web MVP，并能以最低复杂度支持 45 分钟中文技术面试、低延迟语音对话、候选人打断 AI、双方转写、Node.js 服务端密钥保护与可控成本？需比较国内官方的原生实时语音到语音方案，并与流式 ASR → 文本 LLM → 流式 TTS 组合路线对照，给出一个首选和一个降级方案。

## Answer

采用阿里云百炼 Qwen3.5-Omni-Flash-Realtime（北京地域）作为主路径：浏览器以 WebRTC 传输实时音频，本机 Node.js 代理 SDP 鉴权并持有长期 API Key，同时保存双方最终转写。若端到端模型的 50 分钟 PoC、技术词转写、打断或可控性未通过，则降级为同一厂商的流式 ASR → Qwen 文本模型 → 流式 TTS 组合链路；只有百炼两条路线均不满足时才验证火山引擎 RTC 对话式 AI。

完整比较、价格、官方来源和 PoC 门槛见 [`docs/research/mainland-realtime-voice.md`](../../../docs/research/mainland-realtime-voice.md)。
