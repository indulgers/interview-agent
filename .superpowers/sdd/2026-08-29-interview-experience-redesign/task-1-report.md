# Task 1 报告：显式候选人回答提交

## 状态

DONE

## RED 记录

### Provider 契约

命令：

```bash
./node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts
```

真实结果：退出码 1；19 个测试中 7 个失败、12 个通过。失败原因与预期一致：`turn_detection` 仍是 `semantic_vad`，且连接没有 `submitAnswer()`。

补充的失败收尾变异检查：

```bash
./node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts -t "restores a muted track when a submitted response fails"
```

真实结果：退出码 1；目标测试因 provider `error` 后本地音轨仍为 disabled 而失败。

### Session machine 契约

命令：

```bash
./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts
```

真实结果：退出码 1；36 个测试中 5 个失败、31 个通过。失败原因与预期一致：缺少 `sessionId` / `answerSubmission`，测试替身及状态机仍使用旧结束回答命令，重连期间提交也被错误放行。

## GREEN 与最终验证

Provider 聚焦 GREEN：

```bash
./node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts src/modules/realtime-voice/bailian/events.test.ts
```

结果：退出码 0；2 个测试文件全部通过。

Session machine 聚焦 GREEN：

```bash
./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts
```

结果：退出码 0；36/36 通过。

最终验证：

```bash
./node_modules/.bin/vitest run src/modules/realtime-voice src/modules/interview-session/machine.test.ts
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
git diff --check
```

结果：退出码均为 0；最终测试为 4 个文件、66/66 通过；Next route types 生成成功；TypeScript 无错误；diff check 无错误。提交后再次运行测试、`tsc --noEmit`、`git diff --check`，结果仍全部通过。

## 修改文件

- `src/modules/realtime-voice/port.ts`
- `src/modules/realtime-voice/bailian/adapter.ts`
- `src/modules/realtime-voice/bailian/adapter.test.ts`
- `src/modules/realtime-voice/memory-realtime-voice.ts`
- `src/modules/interview-session/types.ts`
- `src/modules/interview-session/machine.ts`
- `src/modules/interview-session/machine.test.ts`
- `src/app/dev/realtime-spike/realtime-spike.tsx`（简报清单遗漏的旧端口直接消费者；经主任务确认后做一行必要迁移）

## 提交

`3956e0c887e9f069227c3e707895d7f5d30dedfa` (`feat: require explicit answer submission`)

## 自审

- `RealtimeConnection` 只暴露新的 `submitAnswer(): Promise<void>`；UI-facing `InterviewSession.signalEndOfAnswer()` 保持不变并委托新端口。
- 百炼 session 使用 `turn_detection: null`；显式提交严格依次发送 `input_audio_buffer.commit`、`response.create`。
- 同时发生的 provider 提交和 UI 双击均共享同一个 Promise，不会重复发送。
- 断线连接拒绝提交且不新增 outbound 消息；候选人 speech stop 只产生可观察语音/转写事件，不会自动发送 `response.create`。
- 提交前禁用本地音轨；在 `response.done`、provider `error` 或连接关闭后恢复。
- Session view 暴露 `sessionId` 及 `idle | submitting | failed`；候选人停顿保持 listening，只有 provider 接受显式提交后才进入 thinking。
- 覆盖失败后重试、重连期间拒绝、AI speaking 时 barge-in cancellation。
- 提交只包含上述 8 个 Task 1 文件；用户原有 API、history、instrumentation、`next-env.d.ts` 与 `.DS_Store` 改动均未暂存或提交。

## 遗留关注点

- 任务简报的文件清单没有列出 `src/app/dev/realtime-spike/realtime-spike.tsx`，但它直接消费被改名的 provider 端口；不迁移会导致 `tsc --noEmit` 失败。主任务已明确批准该一行迁移，已纳入同一提交。
- `next typegen` 会把用户原有的 `next-env.d.ts` 开发类型引用改成非开发路径；验证后已恢复其任务前的开发路径形式，并保持未暂存。没有遗留功能阻断项。

## Fix round 1 follow-up — 2026-08-29

### 状态

DONE

### 审查修复

- 保持源麦克风 track 启用，仅在显式提交及 AI 响应期间摘除 RTP sender；本地 Web Audio observer 使用保守 RMS 阈值与连续帧锁存，生命周期随连接关闭。
- 本地语音活动在响应期间只发送一次 `response.cancel`，恢复 sender，并驱动一次 `candidate_speech: started`；终态 `response.done` / provider `error` 会在 listener 交付前恢复 sender。
- 提交等待通过连接关闭信号竞态；`close()` 不再等待阻塞 listener。断线/重连/终结会清理旧提交状态，完成/失败回调带 epoch 与 connection 守卫，避免旧连接晚到结果污染新连接。

### RED → GREEN 记录

- 新增 Web Audio observer 测试后先运行目标测试，因 `createWebAudioSpeechActivityObserver` 缺失而失败。
- 新增阻塞 listener 的 close 测试后先运行目标测试，确认 `close()` 被 `eventTail` 阻塞而失败。
- 修复后 adapter observer/close 目标测试通过；完整 adapter/events/session 聚焦套件为 3 个文件、70/70 通过。

### 验证

```text
./node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts src/modules/realtime-voice/bailian/events.test.ts src/modules/interview-session/machine.test.ts
3 files, 70 tests passed
./node_modules/.bin/next typegen
Types generated successfully
./node_modules/.bin/tsc --noEmit
exit 0
git diff --check
exit 0
```

### 关注点

- 生产 observer 依赖浏览器 `AudioContext`；连接边界仍保留可注入 observer seam，测试与非浏览器环境可使用替身。
- 预存的 API/history/instrumentation、`next-env.d.ts` 与 `.DS_Store` dirty 改动未纳入本次提交。
