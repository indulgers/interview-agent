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
