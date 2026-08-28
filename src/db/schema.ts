import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const interviewSessions = sqliteTable('interview_sessions', {
  id: text('id').primaryKey(),
  startedAt: integer('started_at', { mode: 'number' }).notNull(),
  endedAt: integer('ended_at', { mode: 'number' }),
  targetDurationMs: integer('target_duration_ms').notNull(),
  actualDurationMs: integer('actual_duration_ms'),
  result: text('result').notNull(),
  transcriptCompleteness: text('transcript_completeness').notNull().default('complete'),
}, (table) => ({
  validResult: check('interview_sessions_result_check', sql`${table.result} in ('in_progress','completed','interrupted','cancelled')`),
}));

export const contentSnapshots = sqliteTable('content_snapshots', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => interviewSessions.id, { onDelete: 'cascade' }),
  version: text('version').notNull(),
  hash: text('hash').notNull(),
  candidateProfileVersion: text('candidate_profile_version').notNull(),
  candidateProfileHash: text('candidate_profile_hash').notNull(),
  interviewBriefVersion: text('interview_brief_version').notNull(),
  interviewBriefHash: text('interview_brief_hash').notNull(),
  candidateProfile: text('candidate_profile').notNull(),
  interviewBrief: text('interview_brief').notNull(),
}, (table) => ({
  sessionUnique: uniqueIndex('content_snapshots_session_id_idx').on(table.sessionId),
}));

export const interviewTurns = sqliteTable(
  'interview_turns',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull().references(() => interviewSessions.id, { onDelete: 'cascade' }),
    providerTurnId: text('provider_turn_id').notNull(),
    sequence: integer('sequence').notNull(),
    speaker: text('speaker').notNull(),
    text: text('text').notNull(),
    startedAt: integer('started_at', { mode: 'number' }).notNull(),
    endedAt: integer('ended_at', { mode: 'number' }).notNull(),
    hasGap: integer('has_gap', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => ({
    sessionProviderTurn: uniqueIndex('interview_turns_session_provider_turn_idx').on(table.sessionId, table.providerTurnId),
    sessionSequence: uniqueIndex('interview_turns_session_sequence_idx').on(table.sessionId, table.sequence),
  }),
);

export const interviewFeedback = sqliteTable('interview_feedback', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().unique().references(() => interviewSessions.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  failureType: text('failure_type'),
  resultJson: text('result_json'),
  generatedAt: integer('generated_at', { mode: 'number' }),
});

export const schema = { interviewSessions, contentSnapshots, interviewTurns, interviewFeedback };
