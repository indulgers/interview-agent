# AI 模拟面试

面向 Node.js 全栈 + AI Agent 岗位的本地单用户模拟面试。一场面试默认 45 分钟，使用摄像头和麦克风与 AI 面试官实时对话，会后保存最终文字转写并生成六维反馈。

## 产品边界

- 不需要登录，不支持多用户或云同步。
- 简历技术内容已固定在代码中，不上传简历。
- 摄像头只做本机预览；不保存音频、视频或媒体 Blob。
- 只保存最终转写、反馈、会话状态和当时的内容快照。
- 不包含代码编辑器、屏幕共享、转写编辑、搜索或导出。

## 技术与模型

- Next.js 16、React 19、TypeScript、SQLite + Drizzle。
- 实时语音：阿里云百炼北京地域 `qwen3.5-omni-flash-realtime` + WebRTC。
- 候选人最终转写：`qwen3-asr-flash-realtime`。
- 会后反馈：`qwen3.8-flash` + 严格 JSON Schema。

## 本地启动

1. 安装 Node.js 22 和 pnpm 10.12.1。
2. 安装依赖：

   ```bash
   pnpm install --frozen-lockfile
   ```

3. 复制本地配置：

   ```bash
   cp .env.example .env.local
   ```

4. 只在 `.env.local` 中填写北京地域的新 Key 和 Workspace ID：

   ```env
   DASHSCOPE_API_KEY=your-rotated-key
   DASHSCOPE_WORKSPACE_ID=your-workspace-id
   DATABASE_URL=file:./data/interview-agent.db
   ```

5. 初始化数据库并启动：

   ```bash
   pnpm db:migrate
   pnpm dev
   ```

6. 打开 [http://localhost:3000](http://localhost:3000)。首次进入面试页时，允许浏览器使用麦克风和摄像头。

> 如果 Corepack 验证 pnpm 签名失败，可使用 `npx pnpm@10.12.1 <command>` 执行同一命令。

## 常用页面

- `/interview`：设备检查与实时面试。
- `/history`：本地历史记录。
- `/history/[id]`：完整转写、六维反馈、反馈重试和单场删除。
- `/dev/realtime-spike`：开发环境的百炼 WebRTC 连接验证页。

## 自动验证

```bash
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

端到端测试使用只有 `NODE_ENV=test` 启动时才能编译开启的内存语音适配器。正式构建无法通过 URL 参数或公开环境变量启用它。

## 50 分钟真人验收

自动化通过后，仍需在中国大陆真实网络手动执行一次长时验收。记录填写到 `docs/verification/bailian-poc.md`。

1. 确认旧 Key 已撤销，新 Key 只存在 `.env.local`。
2. 关闭占用麦克风/摄像头的其他应用，打开浏览器控制台。
3. 进行完整面试，额外保持会话至约 50 分钟以观察长连接。
4. 口述包含 Node.js、backpressure、Event Loop、RAG、Embedding、Tool Calling 等中英混合词。
5. 至少打断 AI 三次，观察是否快速停声。可在网络面板临时切换离线/在线验证重连。
6. 结束后检查历史转写、六维反馈和百炼控制台费用。

通过标准：无无法恢复的断线；中英混合技术词可理解；打断没有明显继续播放；最终转写、反馈和费用可查。

## 故障恢复

- **设备检查失败**：确认浏览器权限、说话音量和摄像头是否被占用，然后重新检查。
- **语音断开**：系统每 2 秒尝试重连，20 秒后仍失败会安全结束并保存为“已中断”。
- **意外关闭浏览器**：下次启动应用时，遗留的进行中会话会恢复为“已中断”。
- **反馈生成失败**：在历史详情中点击“重试生成反馈”，仍使用当时保存的内容快照。
- **数据库不可用**：确认 `data/` 目录可写，然后重新执行 `pnpm db:migrate`。
