# Task 4 report — deterministic interview session state machine

## Delivered

- Added the provider-neutral `RealtimeVoice` port and a programmable, observable `MemoryRealtimeVoice` test adapter.
- Added `InterviewSession` as the only public orchestration surface. Its commands are `start`, `retry`, `signalEndOfAnswer`, and `end`; callers receive a provider/database/timer-free `InterviewSessionView`.
- Added deterministic `Clock` and `Scheduler` injection. Active duration accumulates only while connected; reconnect and AI-response failure pauses it.
- Session creation occurs only after a voice connection is made. Final turns require provider IDs, speaker, text, and start/end timestamps, and are immediately persisted through `InterviewHistory`.

## State and interface decisions

- Main states: `ready`, `connecting`, `listening`, `thinking`, `speaking`, `paused`, `reconnecting`, `closing`, and `finished`.
- A candidate speaking while the assistant is speaking cancels remaining assistant audio and returns to listening.
- Candidate silence arms the 8-second response hint and 15-second single automatic retry. A second unanswered response pauses for user retry or end.
- Disconnect pauses the active clock immediately, reconnects with a 20-second deadline, resumes from the last confirmed final-turn sequence, and reinjects compact progress.
- Progress is injected every 10 inserted final turns, on budget phase changes, and after reconnect. The injected `InterviewProgress` remains provider-neutral.
- 40:30 sets `allowNewTopics` false; 45:00 enters `closing`; 47:00 ends. `completed` is coerced to `cancelled` unless at least one candidate final answer exists. A transcript gap produces `missing` completeness at finish.
- `signalEndOfAnswer` only delegates to the voice adapter’s VAD-assist operation; it does not manually submit a turn.

## TDD evidence

1. Initial state-machine test run was RED because `./machine` did not exist:
   `Cannot find module './machine' imported from .../machine.test.ts`.
2. After the minimal port/types/machine implementation, the focused suite was GREEN: 10 tests.
3. Added the response-complete lifecycle test; it was RED (`thinking` received where `listening` was required), then GREEN after handling `response: completed`.
4. Added the completion eligibility regression test; it was RED (`completed` received where `cancelled` was required), then GREEN after terminal mapping enforced the candidate-final-answer invariant.

## Verification

Successful final command:

```text
./node_modules/.bin/vitest run && ./node_modules/.bin/next typegen && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . && git diff --check
```

Output: 6 test files passed, 37 tests passed; route types generated; TypeScript, ESLint, and whitespace checks exited 0.

Focused final command:

```text
./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts
```

Output: 14 tests passed.

`pnpm` itself could not be used in this environment because Corepack rejected the registry package signature (`Cannot find matching keyid`). The repository’s checked-in tool binaries were used for the equivalent commands; no dependencies were changed.

## Files

- `src/modules/realtime-voice/port.ts`
- `src/modules/realtime-voice/memory-realtime-voice.ts`
- `src/modules/interview-session/types.ts`
- `src/modules/interview-session/machine.ts`
- `src/modules/interview-session/machine.test.ts`

## Self-review

- Confirmed no provider payloads, database handles, or scheduler controls are exposed through session commands/views.
- Confirmed final-turn duplicate events leave the sequence unchanged and rely on `InterviewHistory`’s idempotent provider-turn contract.
- Confirmed reconnect uses the latest inserted sequence and progress injection; pausing cancels budget checkpoints so downtime does not consume interview time.
- Confirmed all terminal calls pass the effective active duration as the required fourth `InterviewHistory.finish` argument.

## Concerns

- The memory adapter is intentionally test-only. Task 5 still needs the concrete browser/WebRTC adapter and its boundary validation.
- The injected `ProgressSummarizer` establishes the orchestration seam; richer semantic extraction of topics/evidence remains the responsibility of the future summarizer implementation.

## Fix round 1

- `RealtimeConnection.subscribe` now accepts an awaited listener; the memory adapter awaits listener completion and exposes programmable operation rejection for close/cancel/inject behavior.
- The session serializes events through one queue, uses connection epochs to ignore stale connects/events, retries reconnect every two seconds until the 20-second deadline, and safely closes superseded connections.
- Terminal persistence occurs even when close fails and only marks the in-memory terminal view after `InterviewHistory.finish` completes.
- Default progress now derives bounded topics, candidate evidence, and follow-ups from recent final-turn contents. The realtime instructions explicitly allow polite interruption for overlong, vague, or off-topic answers.
- Added a real temporary SQLite burst-event regression: two concurrent final events persist strictly as sequences 1 and 2.

### Evidence at `edc73e6`

Focused verification command and output:

```text
./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts

Test Files  1 passed (1)
     Tests  15 passed (15)
```

Full verification command and output:

```text
./node_modules/.bin/vitest run && ./node_modules/.bin/next typegen && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . && git diff --check

Test Files  6 passed (6)
     Tests  38 passed (38)
Generating route types...
✓ Types generated successfully
```

All commands exited 0 at `edc73e6`; TypeScript and ESLint were silent on success, and `git diff --check` emitted no whitespace errors.

The burst SQLite test was added after the serialized implementation rather than via a separately captured RED run. Therefore there is **no truthful exact RED output to record** for that regression. The test exercises two `MemoryRealtimeVoice.emit(...)` promises concurrently against real temporary SQLite `InterviewHistory` and observes persisted sequence `[1, 2]`.

The only fix-round RED output captured before its corresponding implementation change was the existing lifecycle assertion:

```text
AssertionError: expected 'thinking' to be 'listening'
Expected: "listening"
Received: "thinking"
```

It became green after handling `response: completed` as `listening`.

### Files changed in fix round 1

- `src/modules/interview-session/machine.ts`
- `src/modules/interview-session/types.ts`
- `src/modules/interview-session/machine.test.ts`
- `src/modules/realtime-voice/port.ts`
- `src/modules/realtime-voice/memory-realtime-voice.ts`
- `src/modules/interview-content/instructions.ts`
- `src/modules/interview-content/instructions.test.ts`
- `.superpowers/sdd/2026-08-27-interview-agent-mvp/task-4-report.md`

### Fix-round self-review

- The listener is serial at the adapter boundary and the machine also serializes events through a promise queue, so unawaited burst emission cannot violate `InterviewHistory` sequence ordering.
- Connection epoch checks reject stale successful connections and stale subscribed events; superseded connections are closed.
- Reconnect attempt scheduling is two-second cadence with a separate 20-second terminal deadline, and active duration is paused while reconnecting.
- A close rejection is caught before `InterviewHistory.finish`; the terminal view is assigned only after history persistence resolves.
- Progress injection failures are surfaced as a safe view error while the interview continues; persistence failures are caught by the event queue and pause the session.

### Historical gaps

The gap list below was accurate at the earlier fix-round checkpoints. The continuation below closes those gaps; it is retained as historical evidence rather than a current status report.

## Fix round 2 partial evidence

Added epoch/result/finalizing guards to the initial subscription as well as replacement subscriptions, idempotent connection closing through a `WeakSet`, post-await terminal checks for cancellation and final-turn persistence, retry reset on candidate speech start, and a recoverable paused state if `history.finish` rejects.

Focused command at that checkpoint:

```text
./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts && ./node_modules/.bin/tsc --noEmit
Test Files  1 passed (1)
     Tests  15 passed (15)
```

No new RED test was captured for these partial hardening changes. The continuation below records the subsequent protocol, adapter, and matrix coverage.

## Fix round 2 continuation

- Added the explicit `transcript: pending` voice event, tracked by provider turn ID. Manual finish drains pending transcript IDs for up to five seconds; a matching final turn persists and completes the session. The 45-minute transition now enters closing and uses the same pending-ID drain, while 47 minutes terminates immediately and records missing completeness when IDs remain.
- Added test-adapter controls for deferred connect resolution/rejection and deferred cancel operation; connection close remains observable and idempotent in the session.
- Added focused fake-clock/adapter coverage for a pending transcript followed by its final event during manual drain, a timeout drain that records missing completeness, and a hard-stop tail that records missing completeness.
- Added out-of-order and hung reconnect coverage, including stale late connections being closed and stale events being ignored.
- Added SQLite durability coverage for close failure, queued-event terminal guards, initial connect/history-start recovery, append/summarizer/injection/cancel/finish failure policies, semantic progress contents, and bounded custom summarizer context.
- Added two independent timeout-cycle coverage. The initial third-cycle assertion was correctly changed from `paused` to `listening`: each independent cycle receives its own one automatic retry, while a second unanswered stop within one cycle remains paused.
- Added a deferred cancellation/end race that confirms `end()` can resolve in `closing` while transcript drain is still pending, and a deferred terminal-history persistence check that keeps `end()` pending until persistence resolves.

Final round command/output:

```text
./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts
Test Files  1 passed (1)
     Tests  34 passed (34)

./node_modules/.bin/vitest run && ./node_modules/.bin/next typegen && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . && git diff --check
Test Files  6 passed (6)
     Tests  57 passed (57)
Generating route types...
✓ Types generated successfully
```

The timeout-cycle correction was observed RED before the test expectation was corrected: the third independent cycle correctly remained `listening`, not `paused`. The other continuation tests are regression coverage for already-present hardening behavior; no production behavior was weakened to satisfy the matrix.

## Fix round 3 — test-quality and cadence correction

- Tightened bounded custom summarizer assertions to inspect `customVoice` and the exact injected progress payload; the unrelated adapter can no longer satisfy the test.
- Tightened reconnect assertions to use an identifiable deferred connection, assert the accepted connection’s exact progress payload, and assert the stale connection was closed without injection.
- Mutation testing exposed an actual cadence race: a successful reconnect could still schedule subsequent reconnect attempts. The cadence callback now schedules its next tick only when that attempt remains in `reconnecting`.

Verification after this round:

```text
./node_modules/.bin/vitest run src/modules/interview-session/machine.test.ts --testTimeout 5000
Test Files  1 passed (1)
     Tests  34 passed (34)

./node_modules/.bin/vitest run && ./node_modules/.bin/next typegen && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . && git diff --check
Test Files  6 passed (6)
     Tests  57 passed (57)
Generating route types...
✓ Types generated successfully
```
