# Task 3 completion report

## Status

Complete. SQLite persistence for immutable interview sessions, final transcript turns, content snapshots, feedback state, recovery, and transactional deletion is implemented on `feat/interview-agent-mvp`.

## TDD evidence

- RED: the first focused integration run failed before collecting tests because the requested `src/db/client.ts` and `history.ts` modules did not exist (`Cannot find module '../../db/client'`).
- RED: after the initial minimal implementation, the integration tests reached the database boundary and failed with `Can't find meta/_journal.json file`, proving the tests require the real Drizzle migration rather than silently creating tables.
- GREEN: after generating `drizzle/0000_solid_firestar.sql`, all six focused integration behaviors passed against separately created temporary SQLite files.
- The tests cover session start and snapshot capture, ordered final-turn append, `(session_id, provider_turn_id)` idempotency, one-way terminal transition, abandoned-session recovery, independent feedback retry state, and cascade deletion.
- RED/GREEN follow-up: a regression test first exposed that a session marked `missing` did not surface a list/detail transcript-gap flag when no individual turn carried a gap; summaries now combine session-level completeness with turn-level gap markers.

## Schema and invariants

- `interview_sessions` stores explicit epoch-millisecond start/end timestamps, target/actual durations, terminal result, and transcript completeness.
- `content_snapshots` stores the full candidate profile and interview brief plus human-readable version and content hash; no history read depends on current project documents.
- `interview_turns` stores only final text, ordered sequence, speaker, explicit turn timestamps, and a transcript-gap flag. A unique `(session_id, provider_turn_id)` index makes provider retries idempotent.
- `interview_feedback` stores status separately from session result, optional failure type, structured JSON result, and generation timestamp.
- Every foreign key uses `ON DELETE CASCADE`; deletion executes in one transaction. Every connection opened by `createDatabase()` enables `PRAGMA foreign_keys = ON`.
- Sessions can only transition from `in_progress` once to a terminal result. Startup recovery transitions only remaining `in_progress` rows to `interrupted`; it does not modify terminal rows or transcript completeness.
- No audio/video or provider credentials are persisted.

## Verification

- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm test src/modules/interview-history`: 1 file, 7 tests passed.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm test`: 5 files, 22 tests passed.
- Fresh migration verification: `DATABASE_URL=file:<unique-temp-dir>/fresh.sqlite COREPACK_ENABLE_PROJECT_SPEC=0 pnpm db:migrate` applied successfully; SQLite listed all four history tables and `__drizzle_migrations`.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm typecheck`: passed; Next route types generated and `tsc --noEmit` exited 0.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm lint`: passed with no diagnostics.
- `git diff --check`: passed with no whitespace errors.

## Files

- `drizzle.config.ts`
- `drizzle/0000_solid_firestar.sql`
- `drizzle/meta/_journal.json`
- `src/db/schema.ts`
- `src/db/client.ts`
- `src/modules/interview-history/types.ts`
- `src/modules/interview-history/history.ts`
- `src/modules/interview-history/history.integration.test.ts`

## Self-review

- The business boundary exposes only the approved `InterviewHistory` operations; callers receive domain-shaped dates, feedback, snapshots, and ordered turns rather than Drizzle rows.
- Tests use safe `mkdtemp` directories and remove only those unique directories after closing each SQLite connection.
- Content and turn text are copied into SQLite at write time, so later in-memory mutation or project-document edits cannot alter an existing snapshot or final turn.
- Feedback retry state updates do not change the session result, and sessions with no candidate answer are marked `not_applicable` on terminal transition.

## Concerns

- The application bootstrap must call `migrateDatabase()` once after opening the production database; the client intentionally does not run migrations as a hidden side effect.
- `StartSession` requires the canonical `snapshot` field and final turns require both provider timestamps.

## Review fix round 1

- Extended `ContentSnapshot` and the immutable snapshot row with separate candidate-profile and interview-brief version/hash provenance. `InterviewContent` computes those SHA-256 values at snapshot creation time.
- Changed `finish` to require a validated effective `actualDurationMs` from `InterviewSession`; abandoned recovery now leaves duration null because wall-clock elapsed time includes pauses/unknown downtime.
- Added boundary validation for IDs, text, timestamps, sequence/target/duration integers, snapshot hashes/content, enum values, and turn end-time ordering. Turn timestamps are required by both types and SQL schema.
- Added feedback eligibility and transition rules, including candidate-answer requirement, structured completed feedback, nonempty failure type, stale-field clearing, and failed-to-generating retry.
- Added one-snapshot-per-session and one-sequence-per-session uniqueness constraints, database conflict handling for provider-turn retries, and session-level transcript-gap reporting.
- Replaced the unpublished initial migration with a regenerated migration containing provenance columns, uniqueness indexes, required turn timestamps, and the session-result check constraint.

Fix-round TDD evidence:

- RED: provenance assertions failed because detail omitted the four source-specific fields; GREEN after schema, migration, and detail mapping changes.
- The malformed target/timestamp/duration tests now exercise the new boundary validators; GREEN focused history run passed 8 tests.
- RED: the existing direct `pending → failed` test exposed the enforced feedback state machine; the test was corrected to exercise `pending → generating → failed`, then GREEN passed.

## Review fix round 2

- Added runtime checks for speaker, completeness, malformed session IDs, and terminal feedback misuse. Added SQLite checks for result/completeness/status/speaker/sequence/timestamp/target invariants.
- `appendFinalTurn` now uses an immediate Drizzle transaction and targeted provider-id conflict handling; every SQLite connection sets a 5-second busy timeout. Sequence conflicts remain distinct from provider duplicates.
- Strengthened the unpublished initial migration by regenerating it as `drizzle/0000_fast_rhino.sql` with the new checks and indexes.

TDD/verification evidence:

- RED: malformed completeness validation test initially resolved instead of rejecting; GREEN after runtime enum validation.
- RED: invalid speaker and eligible-session `not_applicable` tests initially resolved; GREEN after boundary and feedback transition guards.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm db:generate` — generated `drizzle/0000_fast_rhino.sql` successfully.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm test src/modules/interview-history/history.integration.test.ts` — 1 file, 8 tests passed.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm test` — 5 files, 23 tests passed.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm typecheck` — route types generated; `tsc --noEmit` passed.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm lint` — passed with no diagnostics.
- `git diff --check` — passed with no whitespace errors.
- Fresh migration command `DATABASE_URL="file:<unique-temp-dir>/fresh.sqlite" COREPACK_ENABLE_PROJECT_SPEC=0 pnpm db:migrate` — migrations applied successfully; SQLite listed `__drizzle_migrations`, `content_snapshots`, `interview_feedback`, `interview_sessions`, and `interview_turns`.

Round-2 self-review: production history writes validate before entering SQLite; source provenance remains computed by InterviewContent; recovery leaves effective duration unknown; no public aliases or provider credentials are persisted; all FK cascades and one-snapshot/one-sequence/provider uniqueness rules remain transactional; and the report is the only post-commit working-tree change.

## Final fix-round verification at `03187b3`

Commands and observed outputs:

- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm test src/modules/interview-history` — Vitest: 1 file, 8 tests passed.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm test` — Vitest: 5 files, 23 tests passed.
- `DATABASE_URL="file:<unique-temp-dir>/fresh.sqlite" COREPACK_ENABLE_PROJECT_SPEC=0 pnpm db:migrate` followed by SQLite table inspection — Drizzle reported `migrations applied successfully`; tables listed were `__drizzle_migrations`, `content_snapshots`, `interview_feedback`, `interview_sessions`, and `interview_turns`.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm typecheck` — Next route types generated successfully; `tsc --noEmit` exited 0.
- `COREPACK_ENABLE_PROJECT_SPEC=0 pnpm lint` — exited 0 with no diagnostics.
- `git diff --check` — no output and exit 0.
- Final pre-report `git status --short --branch` — `## feat/interview-agent-mvp` with no working-tree changes; this report append is the only subsequent modification.

Final changed-file inventory:

- `.superpowers/sdd/2026-08-27-interview-agent-mvp/task-3-report.md`
- `drizzle.config.ts`
- `drizzle/0000_romantic_scarlet_witch.sql`
- `drizzle/meta/0000_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/db/client.ts`
- `src/db/schema.ts`
- `src/modules/interview-content/content.ts`
- `src/modules/interview-content/types.ts`
- `src/modules/interview-history/history.integration.test.ts`
- `src/modules/interview-history/history.ts`
- `src/modules/interview-history/types.ts`

Fix-round self-review: source-specific snapshot hashes are produced by `InterviewContent` and persisted without recomputation; effective duration is supplied by the session controller and recovery leaves it unknown; boundary checks reject malformed identifiers, timestamps, durations, sequences, snapshots, turns, and feedback; feedback transitions enforce completed-session/candidate-answer eligibility and clear stale fields; SQLite uniqueness protects one snapshot, one sequence, and one provider turn per session; provider duplicate inserts use a targeted conflict clause; and all test databases are uniquely temporary files with cleanup.
