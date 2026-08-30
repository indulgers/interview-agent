# Interview Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the mock-interview experience around explicit answer submission, reliable end-to-summary navigation, a soft professional UI, and one photorealistic animated interviewer.

**Architecture:** `InterviewSession` remains the source of truth for turns and terminal state, while `RealtimeVoice` gains one explicit `submitAnswer()` command that hides Bailian manual-mode events. The client routes to the persisted session detail after terminalization; the detail page owns feedback-generation states. Visual changes are split into small room, dialog, portrait, navigation, and summary components rather than expanding `InterviewExperience`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 6, Tailwind CSS 4/global CSS, Zod 4, Drizzle + SQLite, Vitest, Playwright, Bailian Qwen3.5 Omni Realtime over WebRTC.

**Spec:** `docs/superpowers/specs/2026-08-29-interview-experience-redesign.md`

## Global Constraints

- Preserve all pre-existing user changes; at plan creation the worktree contains unstaged API/history changes and a deleted `src/instrumentation.ts`. Never restore, overwrite, stage, or commit them unless they are proven part of the current task.
- Do not add authentication, multiple interviewers, precise lip sync, video generation, digital-human APIs, recording, screen sharing, a code editor, themes, notifications, trend charts, or a new question bank.
- A pause or `speech_stopped` event must never request the next AI response; only the candidate's explicit “回答完成” action may do so.
- AI speech remains interruptible by candidate speech.
- Normal and early termination must navigate to `/history/[id]`; the room must not render as the final destination.
- Use the fixed interviewer assets under `public/interviewer/`; do not introduce external image hosts or runtime image generation.
- Respect visible keyboard focus and `prefers-reduced-motion`.
- Follow RED → GREEN → refactor for every behavior change. Capture the focused RED command before implementation.
- Bailian manual mode follows the official flow: `session.turn_detection: null`, then `input_audio_buffer.commit`, then `response.create`. Reference: https://help.aliyun.com/zh/model-studio/omni-realtime-interaction-process

---

## File Map

- `src/modules/realtime-voice/port.ts`: provider-neutral explicit answer-submission contract.
- `src/modules/realtime-voice/bailian/adapter.ts`: Bailian manual-mode event sequence and local-track gating.
- `src/modules/realtime-voice/bailian/events.ts`: parse manual-mode acknowledgements only if needed for deterministic completion.
- `src/modules/interview-session/machine.ts`: candidate-controlled answer state and terminal session ID.
- `src/modules/interview-session/types.ts`: public view/command types consumed by React.
- `src/features/interview-room/useInterviewSession.ts`: stable browser session facade.
- `src/features/interview-room/InterviewExperience.tsx`: device gate and terminal router transition.
- `src/features/interview-room/InterviewRoom.tsx`: room composition only.
- `src/features/interview-room/EndInterviewDialog.tsx`: accessible confirm/loading/retry dialog.
- `src/features/interview-room/InterviewerPortrait.tsx`: fixed-person state imagery and fallback.
- `src/features/interview-room/Controls.tsx`: soft control bar with explicit busy/disabled states.
- `src/features/navigation/AppNavigation.tsx`: shared product navigation.
- `src/features/history/InterviewSummary.tsx`: post-interview feedback lifecycle and summary actions.
- `src/features/history/HistoryDetail.tsx`: transcript/detail composition using `InterviewSummary`.
- `src/app/globals.css`: scoped design tokens, responsive layout, motion, and focus states.
- `e2e/interview.spec.ts`: complete pause/manual-submit/end/summary/navigation journey.

---

### Task 1: Explicit Candidate-Controlled Answer Submission

**Files:**
- Modify: `src/modules/realtime-voice/port.ts`
- Modify: `src/modules/realtime-voice/bailian/adapter.ts`
- Modify: `src/modules/realtime-voice/bailian/adapter.test.ts`
- Modify: `src/modules/realtime-voice/memory-realtime-voice.ts`
- Modify: `src/modules/interview-session/types.ts`
- Modify: `src/modules/interview-session/machine.ts`
- Modify: `src/modules/interview-session/machine.test.ts`

**Interfaces:**
- Produces: `RealtimeConnection.submitAnswer(): Promise<void>`.
- Produces: `InterviewSessionView.answerSubmission: 'idle' | 'submitting' | 'failed'`.
- Produces: `InterviewSessionView.sessionId: string | null`.
- Keeps: `InterviewSession.signalEndOfAnswer(): Promise<void>` as the UI-facing command, delegating to `submitAnswer()` so callers do not churn.
- Consumes: Bailian client events `input_audio_buffer.commit` and `response.create` in manual mode.

- [ ] **Step 1: Write failing provider-contract tests**

Add focused cases to `adapter.test.ts` that assert the configured session is manual and explicit submit sends exactly two ordered commands:

```ts
expect(sessionUpdate.session.turn_detection).toBeNull();

await connection.submitAnswer();
expect(peer.outbound.sent.slice(-2).map((value) => JSON.parse(value).type)).toEqual([
  'input_audio_buffer.commit',
  'response.create',
]);
```

Also assert two concurrent calls share one promise, a disconnected connection rejects without sending, and candidate `speech_stopped` emits state/transcript events but never sends `response.create`.

- [ ] **Step 2: Run the focused provider test and capture RED**

Run: `./node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts`

Expected: FAIL because `submitAnswer` does not exist and `turn_detection` is still semantic VAD.

- [ ] **Step 3: Implement the minimal provider command**

Change the port:

```ts
export interface RealtimeConnection {
  subscribe(listener: (event: VoiceEvent) => void | Promise<void>): () => void;
  submitAnswer(): Promise<void>;
  cancelAssistantSpeech(): Promise<void>;
  injectProgress(progress: InterviewProgress): Promise<void>;
  close(): Promise<void>;
}
```

In `sendSessionUpdate`, set `turn_detection: null`. In `BailianRealtimeConnection.submitAnswer`, serialize concurrent calls, reject after disconnect, temporarily disable the local audio track before commit, send `input_audio_buffer.commit` then `response.create`, and re-enable the track only after `response.done` or failure. Reuse the existing answer-end promise discipline; delete the old timed-silence implementation after its tests are replaced.

- [ ] **Step 4: Run the provider suite GREEN**

Run: `./node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts src/modules/realtime-voice/bailian/events.test.ts`

Expected: all focused tests PASS with no open timer warnings.

- [ ] **Step 5: Write failing session-machine tests**

Add tests proving:

```ts
await voice.emit({ type: 'candidate_speech', state: 'stopped', at: clock.now() });
expect(voice.connection.submitAnswerCount).toBe(0);
expect(session.view().state).toBe('listening');

const submission = session.signalEndOfAnswer();
expect(session.view().answerSubmission).toBe('submitting');
await submission;
expect(voice.connection.submitAnswerCount).toBe(1);
```

Cover failure → `answerSubmission: 'failed'` → retry, double click idempotency, reconnect rejection, and barge-in cancellation while AI is speaking.

- [ ] **Step 6: Run the focused machine test and capture RED**

Run: `./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts`

Expected: FAIL on the missing view fields/command behavior.

- [ ] **Step 7: Implement the session view and command**

Expose `sessionId`, track the three submission states, and serialize `signalEndOfAnswer`. Never transition to `thinking` from `candidate_speech: stopped`; transition only when the provider accepts `submitAnswer()`. Preserve candidate-speech barge-in behavior while `state === 'speaking'`.

- [ ] **Step 8: Verify Task 1 and commit**

Run:

```bash
./node_modules/.bin/vitest run src/modules/realtime-voice src/modules/interview-session/machine.test.ts
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
git diff --check
```

Commit only Task 1 files:

```bash
git add src/modules/realtime-voice src/modules/interview-session/types.ts src/modules/interview-session/machine.ts src/modules/interview-session/machine.test.ts
git commit -m "feat: require explicit answer submission"
```

---

### Task 2: Reliable End Dialog and Terminal Navigation

**Files:**
- Create: `src/features/interview-room/EndInterviewDialog.tsx`
- Create: `src/features/interview-room/EndInterviewDialog.test.tsx`
- Modify: `src/features/interview-room/Controls.tsx`
- Modify: `src/features/interview-room/InterviewRoom.tsx`
- Modify: `src/features/interview-room/InterviewRoom.test.tsx`
- Modify: `src/features/interview-room/useInterviewSession.ts`
- Modify: `src/features/interview-room/InterviewExperience.tsx`
- Modify: `src/modules/interview-session/types.ts`

**Interfaces:**
- Consumes: `InterviewSessionView.sessionId` from Task 1.
- Produces: `EndInterviewDialog({ open, pending, error, onCancel, onConfirm })`.
- Produces: `useInterviewSession.end(): Promise<{ sessionId: string; result: 'completed' | 'cancelled' | 'interrupted' }>`.
- Produces: terminal navigation to `/history/${encodeURIComponent(sessionId)}` via `router.replace`.

- [ ] **Step 1: Write the failing dialog tests**

Use the existing React component-test pattern to assert: initial focus moves to “继续面试”, Escape calls `onCancel`, confirm calls `onConfirm` once, pending disables both actions and changes copy to “正在保存…”, and an error restores a “重试结束” action.

```tsx
render(<EndInterviewDialog open pending={false} error={null} onCancel={cancel} onConfirm={confirm} />);
fireEvent.click(screen.getByRole('button', { name: '确认结束并查看总结' }));
expect(confirm).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run the dialog test and capture RED**

Run: `./node_modules/.bin/vitest run src/features/interview-room/EndInterviewDialog.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the accessible dialog**

Use a portal-free fixed overlay within the room, `role="dialog"`, `aria-modal="true"`, labelled title/description IDs, Escape listener only while open, focus restoration to the trigger, and local re-entry protection in addition to the disabled button.

- [ ] **Step 4: Write failing end-to-navigation component tests**

Mock `next/navigation` and the session hook. Assert confirm closes the dialog and calls:

```ts
expect(replace).toHaveBeenCalledWith('/history/session-123');
```

Assert rejected `end()` leaves the room mounted, shows a recoverable message, and allows a second confirm. Assert a naturally finished session performs the same redirect without opening the dialog.

- [ ] **Step 5: Run the room/experience tests and capture RED**

Run: `./node_modules/.bin/vitest run src/features/interview-room/EndInterviewDialog.test.tsx src/features/interview-room/InterviewRoom.test.tsx`

Expected: FAIL on missing navigation and persistent confirm state.

- [ ] **Step 6: Implement terminal result return and redirect**

Make `session.end()` wait for durable terminal persistence, then return the terminal view. `useInterviewSession.end()` must throw if no session ID exists. `InterviewExperience` owns `ending`, `endError`, and the one terminal redirect effect; `InterviewRoom` remains present only until durable end succeeds.

- [ ] **Step 7: Verify Task 2 and commit**

Run:

```bash
./node_modules/.bin/vitest run src/features/interview-room src/modules/interview-session/machine.test.ts
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
git diff --check
```

Commit:

```bash
git add src/features/interview-room src/modules/interview-session/types.ts
git commit -m "fix: route ended interviews to summary"
```

---

### Task 3: Post-Interview Summary Lifecycle and Navigation

**Files:**
- Create: `src/features/navigation/AppNavigation.tsx`
- Create: `src/features/navigation/AppNavigation.test.tsx`
- Create: `src/features/history/InterviewSummary.tsx`
- Create: `src/features/history/InterviewSummary.test.tsx`
- Modify: `src/features/history/HistoryDetail.tsx`
- Modify: `src/features/history/HistoryDetail.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/history/page.tsx`
- Modify: `src/app/history/[id]/page.tsx`
- Modify: `src/app/api/interviews/[id]/feedback/route.ts` only if the current unstaged user version is first reconciled and the change is additive.

**Interfaces:**
- Produces: `AppNavigation({ active: 'home' | 'interview' | 'history', compact?: boolean })`.
- Produces: `InterviewSummary({ detail }: { detail: SessionDetail })`.
- Consumes: existing same-origin JSON feedback POST and persisted `feedbackStatus`.

- [ ] **Step 1: Write failing summary-state tests**

Cover four persisted states: `pending`, `generating`, `completed`, `failed`, plus `not_applicable`. Required assertions:

```tsx
expect(screen.getByText('正在分析本场回答')).toBeInTheDocument();
expect(screen.getByRole('link', { name: '返回首页' })).toHaveAttribute('href', '/');
expect(screen.getByRole('link', { name: '查看面试记录' })).toHaveAttribute('href', '/history');
expect(screen.getByRole('link', { name: '再练一场' })).toHaveAttribute('href', '/interview');
```

For `pending`, assert one same-origin JSON feedback request starts generation. For `generating`, poll detail with a bounded interval and stop on unmount/completion. For `failed`, render a retry action; for `not_applicable`, explain insufficient evidence without offering six-dimensional scores.

- [ ] **Step 2: Run the focused summary tests and capture RED**

Run: `./node_modules/.bin/vitest run src/features/history/InterviewSummary.test.tsx src/features/history/HistoryDetail.test.tsx`

Expected: FAIL because `InterviewSummary` and shared actions do not exist.

- [ ] **Step 3: Implement the summary lifecycle**

Keep server-loaded `SessionDetail` as initial data. Use a client polling helper with one in-flight request, `AbortController`, 1.5-second cadence, and a 60-second UI timeout that leaves the user on a useful “仍在生成，可稍后从面试记录查看” state. Do not create duplicate feedback claims; rely on the existing atomic server claim.

- [ ] **Step 4: Write and implement navigation tests**

Assert correct active item, three stable routes, visible focus labels, and compact-room rendering. Add `AppNavigation` to home, history list, and history detail; keep the room variant compact and make attempted departure invoke the end-confirm flow rather than a raw link.

- [ ] **Step 5: Verify Task 3 and commit**

Run:

```bash
./node_modules/.bin/vitest run src/features/history src/features/navigation
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
git diff --check
```

Commit only reconciled Task 3 changes; inspect `git diff` before staging because API/history files were dirty before this plan:

```bash
git add src/features/history src/features/navigation src/app/page.tsx src/app/history
git commit -m "feat: add post-interview summary flow"
```

---

### Task 4: Photorealistic Interviewer and Soft Room UI

**Files:**
- Create: `src/features/interview-room/InterviewerPortrait.tsx`
- Create: `src/features/interview-room/InterviewerPortrait.test.tsx`
- Modify: `src/features/interview-room/InterviewRoom.tsx`
- Modify: `src/features/interview-room/Controls.tsx`
- Modify: `src/features/interview-room/DeviceCheck.tsx`
- Modify: `src/features/history/HistoryList.tsx`
- Modify: `src/features/history/HistoryDetail.tsx`
- Modify: `src/app/globals.css`
- Replace: `public/interviewer/*.png` with compressed `.webp` siblings; delete the four PNG files after visually verifying the derivatives so production and Git keep only the WebP assets.

**Interfaces:**
- Produces: `InterviewerPortrait({ state }: { state: SessionState })`.
- Consumes: session states and the fixed same-person images.
- Produces CSS scopes: `.app-nav`, `.interview-room`, `.interviewer-portrait`, `.room-toolbar`, `.end-dialog`, `.interview-summary`.

- [ ] **Step 1: Create optimized image derivatives**

Use the preinstalled `sips` if it advertises WebP support; otherwise use an already-installed Sharp binary/library. Resize to at most 1600px wide, encode WebP, record exact before/after byte sizes, visually compare all four derivatives, then delete the PNG sources. If neither existing tool can encode WebP, stop this step and report the missing capability rather than installing a new dependency or silently changing formats.

- [ ] **Step 2: Write failing portrait-state tests**

Assert `listening` uses `listening.webp`, `thinking|connecting` uses `thinking.webp`, `speaking` renders base and speaking layers, image failure falls back to `base.webp`, and reduced-motion class disables alternation.

- [ ] **Step 3: Run portrait tests and capture RED**

Run: `./node_modules/.bin/vitest run src/features/interview-room/InterviewerPortrait.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Implement the portrait**

Use `next/image` with identical dimensions and absolutely stacked layers so transitions never reflow. Use CSS opacity for a 200ms crossfade, a low-frequency speaking keyframe, and a subtle <=1% idle transform. Set useful accessible labels by state; decorative duplicate layers use empty alt text.

- [ ] **Step 5: Replace the visual system deliberately**

Define the approved tokens in `:root`, then rebuild room, device, history, dialog, and summary styles using 18–24px card radii and 12–14px button radii. Add `:hover`, `:active`, `:focus-visible`, disabled, busy, and responsive rules. Remove the old newspaper serif treatment, square borders, SVG orbit, and bottom-sheet confirmation styles only after every selector has a new consumer.

- [ ] **Step 6: Run component tests and capture screenshots**

Run focused tests, then use Playwright at 1440×900, 768×900, and 390×844 to capture device, room, dialog, generating-summary, and completed-summary screenshots. Inspect them for clipping, overlay stacking, readable subtitles, and touch target size. Fix one visual issue at a time and recapture.

- [ ] **Step 7: Verify Task 4 and commit**

Run:

```bash
./node_modules/.bin/vitest run src/features
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint .
git diff --check
```

Commit:

```bash
git add src/features src/app/globals.css public/interviewer
git commit -m "feat: refresh interview room experience"
```

---

### Task 5: End-to-End Acceptance and Release Cleanup

**Files:**
- Modify: `e2e/interview.spec.ts`
- Modify: `README.md`
- Create: `docs/verification/interview-experience-redesign.md`

**Interfaces:**
- Consumes: Task 1 manual submission, Task 2 terminal navigation, Task 3 summary lifecycle, Task 4 UI/portrait.
- Produces: one automated release journey and a concise manual visual checklist.

- [ ] **Step 1: Extend the test-only voice controls**

Expose counters for `submitAnswer`, `response.create`, and `cancelAssistantSpeech` through the existing compiled-test-only runtime registry. Keep the production compile-time isolation test green.

- [ ] **Step 2: Write the failing Playwright journey**

Drive this exact flow:

1. Complete device check and start.
2. Emit candidate speech start/stop and wait 2 seconds; assert response-create count remains zero and interviewer remains in listening state.
3. Click “回答完成”; assert one submit and one response request.
4. Emit AI speaking, then candidate speech; assert cancel count increments.
5. Open early-end dialog, cancel it, reopen, confirm once.
6. Assert URL becomes `/history/<id>` and the dialog/room disappear.
7. Assert generating summary is usable, complete deterministic feedback, then assert six dimensions and three navigation exits.
8. Navigate to history and back to the saved detail.

- [ ] **Step 3: Run the E2E test and capture RED**

Run: `./node_modules/.bin/playwright test e2e/interview.spec.ts --grep "manual answer and early summary"`

Expected: FAIL at the first newly asserted behavior before final implementation corrections.

- [ ] **Step 4: Make only integration corrections**

Fix wiring, labels, timing, and test-mode controls surfaced by E2E. Do not add new product behavior in this task. Record any provider-only behavior that cannot be proven by MemoryRealtimeVoice as a manual check.

- [ ] **Step 5: Run the complete release gate**

Run:

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/playwright test
./node_modules/.bin/next typegen
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint .
./node_modules/.bin/next build --webpack
git diff --check
```

Expected: all commands exit 0. Inspect browser console output for uncaught errors and confirm no API payload or persisted session contains audio/video data URLs, blobs, API keys, or secrets.

- [ ] **Step 6: Update user-facing operations and verification notes**

Update `README.md` to describe “回答完成”, early-end summary, navigation, and fixed interviewer imagery. In `docs/verification/interview-experience-redesign.md`, record commands/results, screenshot viewport checks, remaining manual Bailian checks, and the existing user-owned 50-minute acceptance status without claiming it passed.

- [ ] **Step 7: Final review and commit**

Review the complete diff against `docs/superpowers/specs/2026-08-29-interview-experience-redesign.md`, then commit only Task 5 files and any proven integration correction:

```bash
git add e2e/interview.spec.ts README.md docs/verification/interview-experience-redesign.md
git commit -m "test: verify redesigned interview experience"
```
