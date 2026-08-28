CREATE TABLE `content_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`version` text NOT NULL,
	`hash` text NOT NULL,
	`candidate_profile_version` text NOT NULL,
	`candidate_profile_hash` text NOT NULL,
	`interview_brief_version` text NOT NULL,
	`interview_brief_hash` text NOT NULL,
	`candidate_profile` text NOT NULL,
	`interview_brief` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_snapshots_session_id_idx` ON `content_snapshots` (`session_id`);--> statement-breakpoint
CREATE TABLE `interview_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`status` text NOT NULL,
	`failure_type` text,
	`result_json` text,
	`generated_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_feedback_session_id_unique` ON `interview_feedback` (`session_id`);--> statement-breakpoint
CREATE TABLE `interview_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`target_duration_ms` integer NOT NULL,
	`actual_duration_ms` integer,
	`result` text NOT NULL,
	`transcript_completeness` text DEFAULT 'complete' NOT NULL,
	CONSTRAINT "interview_sessions_result_check" CHECK("interview_sessions"."result" in ('in_progress','completed','interrupted','cancelled'))
);
--> statement-breakpoint
CREATE TABLE `interview_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`provider_turn_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`speaker` text NOT NULL,
	`text` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`has_gap` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `interview_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interview_turns_session_provider_turn_idx` ON `interview_turns` (`session_id`,`provider_turn_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `interview_turns_session_sequence_idx` ON `interview_turns` (`session_id`,`sequence`);