# 百炼文本反馈适配器调研

调研日期：2026-08-28
范围：阿里云百炼中国站华北 2（北京）地域；仅依据阿里云官方文档。未读取任何本地凭据，也未调用真实模型。

## 结论

面试后的结构化文本反馈应优先使用 **OpenAI 兼容 Chat Completions API**，而不是 Responses API：

- Base URL：`https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
- HTTP：`POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions`
- 推荐模型：`qwen3.8-flash`
- 推荐输出模式：`response_format.type = "json_schema"`，并设 `strict: true`
- 鉴权：`Authorization: Bearer {DASHSCOPE_API_KEY}`

`qwen3.8-flash` 是当前适合作为默认反馈模型的选择：官方模型页将其列为北京地域可用，模型 ID 明确为 `qwen3.8-flash`，支持结构化输出，并强调响应速度；官方结构化输出页也明确将 Qwen3.8-Flash 系列列入 JSON Schema 支持范围。对于面试评分这类需要固定字段、自动解析的后台任务，JSON Schema 比只保证“合法 JSON”的 JSON Object 更合适。[qwen3.8-flash 模型信息](https://help.aliyun.com/zh/model-studio/qwen3-8-flash)；[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)

若生产环境更看重版本可复现性，可将 `qwen3.7-flash-2026-07-15` 作为保守备选。它是官方列出的快照 ID，北京地域支持 Responses，所属 Qwen3.7-Flash 系列也支持 JSON Schema；但默认建议仍采用当前的 `qwen3.8-flash`。[文本生成模型列表](https://help.aliyun.com/zh/model-studio/text-generation-model)；[Responses 创建响应](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)

## 端点与地域

北京地域官方推荐业务空间专属域名，原因是其具备更高并发承载能力、网络隔离性和较低延迟。北京地域的域名、API Key 和模型列表彼此独立，不能与其他地域混用。[地域及接入域名](https://help.aliyun.com/zh/model-studio/beijing-access-information)

| API | 北京地域请求地址 | 适配器结论 |
| --- | --- | --- |
| Chat Completions | `POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions` | **采用**；官方明确支持 `response_format`，包括 JSON Object 与指定模型上的 JSON Schema。 |
| Responses | `POST https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/responses` | 可用于普通文本/工具调用，但**不用于本适配器的严格 JSON**。 |

Chat Completions 的最新地址与 Base URL 见[OpenAI 兼容 Chat API 参考](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)。Responses 的最新地址见[创建响应](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)；旧路径 `/api/v2/apps/protocols/compatible-mode/v1/responses` 已被官方标记为即将停止维护，不应新接入。

## 为什么不在 Responses 上做结构化反馈

百炼 Responses API 确实支持北京地域与 `qwen3.8-flash`，但其请求参数文档没有列出 OpenAI 的 `text.format`，也没有列出 Chat API 的 `response_format`。同一官方页面明确声明：**只处理文档明确列出的参数，未提及的 OpenAI 参数会被忽略**。因此不能假设给 `/responses` 传 `response_format` 或 `text.format` 就会获得受保证的 JSON；这也是本适配器选择 `/chat/completions` 的直接依据。[Responses API 兼容性说明与请求参数](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses)

## 鉴权与配置边界

- HTTP Header：`Authorization: Bearer {API_KEY}`；同时发送 `Content-Type: application/json`。官方 Chat/结构化输出示例均使用该形式。[结构化输出 curl 示例](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- SDK 可从 `DASHSCOPE_API_KEY` 环境变量读取 Key；不要把 Key 写入前端代码、提交到仓库或记录到日志。
- `{WorkspaceId}` 必须替换为 Key 所属北京业务空间的 ID；业务空间专属域名只能访问当前业务空间，北京地域 Key 与其他地域不能混用。[地域及接入域名](https://help.aliyun.com/zh/model-studio/beijing-access-information)
- API Key 的模型权限由所属业务空间决定；子业务空间 Key 只能调用该空间已获授权的标准模型。[获取与配置 API Key](https://help.aliyun.com/zh/model-studio/get-api-key/)

## JSON 输出能力与限制

### 推荐：JSON Schema

请求体使用：

```json
{
  "model": "qwen3.8-flash",
  "messages": [
    { "role": "system", "content": "根据面试记录生成结构化反馈。" },
    { "role": "user", "content": "..." }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "interview_feedback",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": false
      }
    }
  }
}
```

落地时应补全真实 schema，把业务必需字段全部放入 `required`，并推荐设置 `additionalProperties: false`，避免模型输出未定义字段。官方列出的支持类型为 `string`、`number`、`integer`、`boolean`、`object`、`array`、`enum`。JSON Schema 模式不要求提示词包含 “JSON”，但仍建议明确描述评分含义和字段约束。[结构化输出配置指南](https://help.aliyun.com/zh/model-studio/qwen-structured-output)

官方当前明确支持 JSON Schema 的系列包括 Qwen3.8-Flash、Qwen3.7-Flash、Qwen3.7-Plus、Qwen3.7-Max 和 Qwen3.8-Max；不要把该能力泛化到所有百炼模型。[结构化输出支持模型](https://help.aliyun.com/zh/model-studio/qwen-structured-output)

### 仅作降级：JSON Object

`response_format: {"type":"json_object"}` 只保证返回合法 JSON，不保证字段结构符合预期。System 或 User Message 必须包含 `JSON` 关键词（大小写不敏感），否则 API 会报错。若使用该模式，下游仍应执行 schema 校验并准备重试或修复流程。[结构化输出](https://help.aliyun.com/zh/model-studio/qwen-structured-output)

### 共同注意事项

- 开启结构化输出时，官方要求不要设置即将废弃的 `max_tokens`，否则可能截断 JSON 并产生不可解析结果。若必须限制输出，应在 schema 和提示词上控制内容，并在适配器中保留解析错误处理。[结构化输出：应用于生产环境](https://help.aliyun.com/zh/model-studio/qwen-structured-output)
- Chat API 文档已将 `max_tokens` 标为即将废弃，新接入参数名为 `max_completion_tokens`；不过结构化输出场景仍需谨慎避免把输出上限设得过小。[Chat API 参数参考](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)
- 即使使用严格 schema，适配器仍应捕获 HTTP 错误、空内容与 JSON 解析错误；不要把原始模型字符串未经校验直接写入业务数据。

## 实现建议摘要

1. 服务端读取 `DASHSCOPE_API_KEY` 与 `DASHSCOPE_WORKSPACE_ID`，拼出北京业务空间 Base URL。
2. 调用 `/chat/completions`，模型默认 `qwen3.8-flash`。
3. 使用 `response_format: { type: "json_schema", ... strict: true }`；schema 明确必填项，并关闭额外字段。
4. 对返回的 `choices[0].message.content` 做 JSON 解析及本地 schema 校验；失败时进行有限重试并记录不含敏感信息的诊断数据。
5. 不在 Responses API 上依赖未被百炼文档声明的结构化输出参数。
