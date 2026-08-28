# Task 5 Report — Bailian WebRTC adapter

## Delivered

- Server-only SDP proxy at `POST /api/realtime/session`: validates SDP MIME/body/UTF-8 size, uses the fixed Beijing WebRTC endpoint and keeps credentials server-side. All provider/configuration failures are sanitized.
- Zod-gated official event translator for session connection, VAD start/stop, pending turns, final candidate/assistant transcripts, response lifecycle, errors and diagnostic-only unknown payloads.
- Injectable browser WebRTC/media/fetch adapter: audio transceiver, `oai-events`, validated inbound `txt`, ICE/channel waits, remote audio, documented `session.update`, sequential event listeners, temporary VAD-assist muting, documented `response.cancel`, progress injection and idempotent cleanup.
- Development-only `/dev/realtime-spike` page and an evidence template at `docs/verification/bailian-poc.md`.

## TDD evidence

RED:

- `node_modules/.bin/vitest run src/app/api/realtime/session/route.test.ts src/modules/realtime-voice/bailian/events.test.ts` initially failed because `./route` and `./events` did not exist.
- `node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts` initially failed because `./adapter` did not exist.
- Added UTF-8-overlimit SDP test failed with `502` before byte-limit validation was implemented.
- Temporarily removing inbound-channel validation made its focused test fail, then the validation was restored.
- The session-update contract failed until `input_audio_transcription` was explicitly enabled for final candidate transcripts.

GREEN:

- `node_modules/.bin/vitest run src/app/api/realtime/session/route.test.ts src/modules/realtime-voice/bailian/events.test.ts src/modules/realtime-voice/bailian/adapter.test.ts`
- Result: 3 files passed, 17 tests passed (2026-08-28).
- `node_modules/.bin/vitest run` — 9 files, 76 tests passed.
- `node_modules/.bin/next typegen && node_modules/.bin/tsc --noEmit`, `node_modules/.bin/eslint .`, `node_modules/.bin/next build --webpack`, and `git diff --check` passed (2026-08-28).

## Scope withheld by security gate

No real provider request was made, no credentials were inspected, and no credential value was placed in code, tests, docs, output, or logs. A real 50-minute mainland-network PoC is **NEEDS_CONTEXT**: first revoke the previously exposed key, then put a newly rotated key and workspace ID only in local `.env.local`. Complete the unchecked evidence table in `docs/verification/bailian-poc.md` before deciding whether the direct adapter remains acceptable.

## Remaining verification

Only the credential-gated real 50-minute mainland-network PoC remains. It is deliberately unchecked rather than simulated.

## Fix round 1 (2026-08-28)

RED/GREEN: added strict SDP MIME, streamed byte-budget, workspace-label, and upstream Answer validation cases; the route suite is 11/11 GREEN. Adapter contract remains GREEN (5/5) after gating the local track (`enabled=false` plus `replaceTrack(null)`) until inbound `txt` delivers `session.created`; it then configures with the dedicated WebRTC top-level PCM format fields and restores the track. The development spike now closes on unmount and exposes a disconnect control. No live call or credential access occurred.

## Fix round 2 (2026-08-28)

RED:

- New adapter/event regressions initially failed because there was no item-ID timing correlation, an answer-ending call could reuse an earlier `speech_stopped`, and close could leave the local track muted.
- A never-resolving browser SDP fetch regression initially hung: browser timeout did not abort the request or force the normal resource-cleanup path.

GREEN:

- `signalEndOfAnswer()` now drains already-queued provider events, creates one fresh generation-bound waiter per answer, shares concurrent calls, and restores the track on matching VAD stop, timeout, and close.
- Browser negotiation uses one aborting timeout boundary for SDP fetch, ICE gathering, outbound channel readiness, and inbound `session.created`; focused fakes prove cleanup of track, channels, audio, and peer on each timeout.
- Rejected `audio.play()` now emits the normalized recoverable event without preventing later provider events. Listener throws/rejections and diagnostic callback failures cannot break the sequential event queue.
- Candidate final-turn timing correlates `audio_start_ms`/`audio_end_ms` by `item_id`, clamps malformed order deterministically, clears consumed IDs, and uses optional assistant provider timing without negative durations.
- The development spike reuses a tested connection-close helper for explicit disconnect and unmount cleanup. `response.cancel` remains the only client cancellation event; no playback-buffer event is emitted or claimed.
- GREEN evidence: `node_modules/.bin/vitest run src/modules/realtime-voice/bailian/adapter.test.ts` — 14/14; focused route/realtime suite — 3 files, 34 tests; full suite — 10 files, 94 tests; `next typegen && tsc --noEmit`, ESLint, Webpack production build, and `git diff --check` all passed. `pnpm` could not be used because Corepack's package-signature verification failed before command execution, so installed project binaries were used.

The only remaining PoC is the security-gated real 50-minute mainland-network session described above. No provider request was performed and no credential value was added to task code, tests, or documentation.
