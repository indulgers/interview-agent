# AI 模拟面试 Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Deliver a local, single-user 45-minute Chinese mock-interview web app with Bailian realtime voice, a speaking avatar, immutable transcript history, and evidence-based feedback.

**Architecture:** A Next.js App Router/TypeScript monolith owns five deep modules: `InterviewSession`, `RealtimeVoice`, `InterviewContent`, `InterviewHistory`, and `InterviewFeedback`. Browser WebRTC carries media directly to Bailian; local Node routes protect credentials and persist final turns to SQLite. Provider details stay behind ports so tests run against deterministic fakes and the composed ASR→LLM→TTS fallback remains possible.

**Tech Stack:** Next.js 16.3.3, React 19.2.8, TypeScript 7.0.2, Tailwind CSS 4.3.3, Drizzle ORM 0.45.2, better-sqlite3 13.0.3, Zod, Vitest 4.1.11, Playwright 1.62.1, pnpm.

---

## Task 1: Bootstrap the secure local application

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.example`
- Modify: `.gitignore`

- [ ] Write `src/lib/env.test.ts` first: missing key/workspace produces a safe configuration error; valid values parse; error text never contains a secret.
- [ ] Add exact dependencies and scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `test:e2e`, `db:generate`, `db:migrate`.
- [ ] Implement server-only validation:

```ts
const ServerEnv = z.object({
  DASHSCOPE_API_KEY: z.string().min(1),
  DASHSCOPE_WORKSPACE_ID: z.string().min(1),
  DATABASE_URL: z.string().default('file:./data/interview-agent.db'),
});
export type ServerEnv = z.infer<typeof ServerEnv>;
export function readServerEnv(source = process.env): ServerEnv;
```

- [ ] Add `.env.example` with names and safe dummy values only; ensure `.env*` remains ignored except `.env.example`.
- [ ] Build a minimal Chinese home shell with “开始模拟面试” and “历史记录”; no provider configuration is exposed in the browser.
- [ ] Run `pnpm test src/lib/env.test.ts && pnpm typecheck && pnpm build`.
- [ ] Commit: `chore: bootstrap interview agent app`.

## Task 2: Model fixed interview content and progress memory

**Files:**
- Create: `src/modules/interview-content/types.ts`, `content.ts`, `instructions.ts`, `progress.ts`
- Create: `src/modules/interview-content/*.test.ts`
- Read: `docs/product/candidate-profile.md`, `docs/product/interview-brief.md`

- [ ] Write failing tests for privacy-filtered immutable snapshots, stable SHA-256 hash/version, five time phases, and prompt rules (“claims are unverified”, no coaching, no hiring verdict).
- [ ] Define the public types:

```ts
export type InterviewPhase = 'intro' | 'project' | 'fullstack' | 'agent' | 'wrapup';
export interface InterviewProgress {
  phase: InterviewPhase;
  coveredTopics: string[];
  evidence: Array<{ claim: string; observation: string; turnIds: string[] }>;
  pendingFollowUps: string[];
  updatedThroughSequence: number;
}
export interface ContentSnapshot {
  version: string;
  hash: string;
  candidateProfile: string;
  interviewBrief: string;
}
```

- [ ] Implement `createContentSnapshot()`, `phaseAt(elapsedMs)`, `createInitialProgress()`, and `buildRealtimeInstructions(snapshot, progress)` as pure functions.
- [ ] Ensure instructions serialize a compact progress ledger so reconnection and the 80-turn/480-second Flash context window do not repeat covered areas.
- [ ] Run `pnpm test src/modules/interview-content && pnpm typecheck`.
- [ ] Commit: `feat: add interview content and progress memory`.

## Task 3: Persist immutable sessions, turns, and feedback state

**Files:**
- Create: `drizzle.config.ts`, `src/db/schema.ts`, `src/db/client.ts`, `drizzle/*`
- Create: `src/modules/interview-history/history.ts`, `types.ts`, `history.integration.test.ts`

- [ ] Write integration tests against a temporary SQLite file for start, ordered append, duplicate turn id, terminal-state guard, startup recovery, snapshot immutability, feedback retry state, and transactional delete.
- [ ] Create tables `interview_sessions`, `interview_turns`, `content_snapshots`, and `interview_feedback`; use foreign keys and a unique `(session_id, provider_turn_id)` index.
- [ ] Expose business operations only:

```ts
export interface InterviewHistory {
  start(input: StartSession): Promise<SessionId>;
  appendFinalTurn(input: FinalTurn): Promise<'inserted' | 'duplicate'>;
  finish(id: SessionId, result: 'completed' | 'interrupted' | 'cancelled', completeness: TranscriptCompleteness): Promise<void>;
  setFeedback(id: SessionId, update: FeedbackUpdate): Promise<void>;
  list(): Promise<SessionSummary[]>;
  detail(id: SessionId): Promise<SessionDetail | null>;
  delete(id: SessionId): Promise<void>;
  recoverAbandoned(): Promise<number>;
}
```

- [ ] Generate and apply the first migration; enable SQLite foreign keys on every connection.
- [ ] Run `pnpm test src/modules/interview-history && pnpm db:migrate && pnpm typecheck`.
- [ ] Commit: `feat: persist interview history`.

## Task 4: Build the deterministic interview session state machine

**Files:**
- Create: `src/modules/interview-session/types.ts`, `machine.ts`, `machine.test.ts`
- Create: `src/modules/realtime-voice/port.ts`, `memory-realtime-voice.ts`

- [ ] Write failing fake-clock tests for required devices, connect/start, listening/thinking/speaking, candidate barge-in, 8/15-second timeout, 20-second reconnect, 40:30 new-topic cutoff, 45-minute soft close, 47-minute hard stop, and completed/interrupted/cancelled results.
- [ ] Add tests that final turns persist immediately and duplicate provider events are harmless.
- [ ] Add tests that progress is compacted and reinjected every 10 final turns, on phase transition, and after reconnect.
- [ ] Define the provider-neutral port:

```ts
export interface RealtimeConnection {
  subscribe(listener: (event: VoiceEvent) => void): () => void;
  signalEndOfAnswer(): Promise<void>;
  cancelAssistantSpeech(): Promise<void>;
  injectProgress(progress: InterviewProgress): Promise<void>;
  close(): Promise<void>;
}
export interface RealtimeVoice {
  connect(input: RealtimeConnectInput): Promise<RealtimeConnection>;
}
```

- [ ] Implement the machine with injected clock, voice, history, content, and progress summarizer dependencies; keep provider events outside its public API.
- [ ] Run `pnpm test src/modules/interview-session && pnpm typecheck`.
- [ ] Commit: `feat: orchestrate interview sessions`.

## Task 5: Prove and implement the Bailian WebRTC adapter

**Files:**
- Create: `src/app/api/realtime/session/route.ts`, `route.test.ts`
- Create: `src/modules/realtime-voice/bailian/events.ts`, `adapter.ts`, `adapter.test.ts`
- Create: `src/app/dev/realtime-spike/page.tsx`
- Create: `docs/verification/bailian-poc.md`

- [ ] Write route tests that mock `fetch` and assert `POST https://{workspace}.cn-beijing.maas.aliyuncs.com/api/v1/webrtc/realtime?model=qwen3.5-omni-flash-realtime`, `Content-Type: application/sdp`, Bearer auth, and sanitized failures.
- [ ] Write Zod contract tests from official samples for connection, speech start/stop, final input transcript, final assistant transcript, response lifecycle, and error events; unknown events must be diagnostic-only.
- [ ] Implement browser negotiation with an audio transceiver, outbound `oai-events` data channel, inbound `txt` channel, remote audio element, and `session.update` using audio+text, selected voice, instructions, and `semantic_vad`.
- [ ] Implement `signalEndOfAnswer()` by disabling the local audio track long enough to produce a clear silence interval, then restoring it after the server reports speech stopped; never label it manual VAD bypass.
- [ ] Add the smallest spike page showing connection, live event names, both final transcripts, remote audio, and barge-in state; gate it to development.
- [ ] With a revoked old key and a newly rotated key plus Workspace ID in local `.env.local`, run one 50-minute mainland-network session and record connection/reconnect, mixed technical terms, first-audio latency, interruption-stop latency, context-ledger behavior, and console cost in `docs/verification/bailian-poc.md`.
- [ ] Decision gate: if turn ending or the overall endpoint fails the approved acceptance test, stop and amend this plan to implement the same-vendor composed adapter before product UI work.
- [ ] Run `pnpm test src/app/api/realtime src/modules/realtime-voice && pnpm typecheck && git diff --check`.
- [ ] Commit: `feat: integrate bailian realtime voice`.

## Task 6: Build device readiness and the immersive interview room

**Files:**
- Create: `src/app/interview/page.tsx`
- Create: `src/features/interview-room/DeviceCheck.tsx`, `InterviewRoom.tsx`, `Avatar.tsx`, `Controls.tsx`, `useInterviewSession.ts`
- Create: corresponding `*.test.tsx`
- Create: `public/avatar-mouth-closed.svg`, `public/avatar-mouth-open.svg`

- [ ] Write component tests for denied/missing/silent mic or camera, disabled start, local-only video label, state overlays, control confirmation, and no live transcript panel.
- [ ] Implement readiness using `getUserMedia`; require both live tracks plus observed microphone level and advancing video frames before enabling start.
- [ ] Implement the approved layout: central interviewer, candidate PiP, current question/state overlay, and mic/camera/end-answer/end-interview controls.
- [ ] Drive two-frame mouth animation from remote audio analyser amplitude and always close the mouth when playback stops.
- [ ] Wire the hook only to `InterviewSession` commands/view state; UI must not import Bailian event types or database code.
- [ ] Run `pnpm test src/features/interview-room && pnpm typecheck && pnpm build`.
- [ ] Commit: `feat: add immersive interview room`.

## Task 7: Generate evidence-based feedback

**Files:**
- Create: `src/modules/interview-feedback/schema.ts`, `prompt.ts`, `feedback.ts`, `bailian-text-model.ts`
- Create: `src/modules/interview-feedback/*.test.ts`
- Create: `src/app/api/interviews/[id]/feedback/route.ts`

- [ ] Write tests for exactly six 1–5 dimensions, per-dimension turn evidence, “本场未充分验证”, three strengths, three weak moments, three priorities, missing-transcript warning, no hiring verdict, and retry against the saved snapshot.
- [ ] Define a strict Zod result schema and a `FeedbackModel.generate()` seam; the production adapter calls Bailian's OpenAI-compatible text endpoint server-side with JSON output instructions.
- [ ] Implement validation plus one repair retry; never invent a turn id and reject citations that are absent from persisted history.
- [ ] Persist `pending → generating → completed|failed`; only completed sessions with at least one candidate final turn are eligible.
- [ ] Run `pnpm test src/modules/interview-feedback src/app/api/interviews && pnpm typecheck`.
- [ ] Commit: `feat: generate interview feedback`.

## Task 8: Add local history and recovery UI

**Files:**
- Create: `src/app/history/page.tsx`, `src/app/history/[id]/page.tsx`
- Create: `src/features/history/HistoryList.tsx`, `HistoryDetail.tsx`, `DeleteInterview.tsx`
- Create: `src/app/api/interviews/route.ts`, `src/app/api/interviews/[id]/route.ts`
- Create: corresponding tests

- [ ] Write tests for reverse chronology, result/duration/feedback/completeness badges, full ordered transcript, snapshot version, six-dimension feedback, failed-feedback retry, and confirmed single-session deletion.
- [ ] Recover abandoned `in_progress` rows to `interrupted` once at application startup before rendering history.
- [ ] Implement list/detail/delete through `InterviewHistory`; no transcript editing, search, export, batch action, or media playback.
- [ ] Keep deletion transactional and require a confirmation dialog stating there is no recycle bin.
- [ ] Run `pnpm test src/features/history src/app/api/interviews && pnpm typecheck && pnpm build`.
- [ ] Commit: `feat: add interview history experience`.

## Task 9: Verify the complete product and update operating docs

**Files:**
- Create: `e2e/interview.spec.ts`, `playwright.config.ts`, `README.md`
- Modify: `docs/verification/bailian-poc.md`

- [ ] Add a test-only dependency injection switch that selects `MemoryRealtimeVoice` only under `NODE_ENV=test`; prove production cannot enable it through a browser query or public environment variable.
- [ ] Write one Playwright journey: device-ready fixture → start → AI/candidate turns → barge-in → final turn persistence → manual finish → feedback → history detail → confirmed delete.
- [ ] Add journeys for reconnect success, 20-second interruption failure, and feedback retry; assert no audio/video blobs or secrets enter API payloads/database.
- [ ] Document setup, rotated credentials, Workspace ID, one-command development, migrations, browser permissions, real PoC procedure, and recovery steps. Never include a real credential.
- [ ] Run the full gate: `pnpm test && pnpm test:e2e && pnpm typecheck && pnpm lint && pnpm build && git diff --check`.
- [ ] Run a Spec/Standards code review and resolve all high/medium findings.
- [ ] Commit: `test: verify interview agent MVP`.

## Definition of done

- The full automated gate passes from a clean checkout after environment setup.
- The documented 50-minute mainland-network PoC has a recorded pass decision or the composed-path amendment has been implemented and retested.
- No real key, candidate contact detail, audio, or video exists in source control or SQLite.
- Every approved MVP requirement maps to an automated test or the explicit real-network PoC.
- A repository-wide placeholder scan returns no unresolved product or implementation markers in executable source.
