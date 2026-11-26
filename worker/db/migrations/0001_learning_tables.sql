CREATE TABLE IF NOT EXISTS `user_chunks` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `en` text NOT NULL,
  `zh` text DEFAULT '' NOT NULL,
  `context_sentence` text,
  `source_type` text DEFAULT 'novel' NOT NULL,
  `source_ref` text,
  `mastery_level` integer DEFAULT 0 NOT NULL,
  `next_review_at` integer NOT NULL,
  `review_count` integer DEFAULT 0 NOT NULL,
  `mastered` integer DEFAULT false NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `user_chunks_user_due_idx` ON `user_chunks` (`user_id`, `mastered`, `next_review_at`);

CREATE TABLE IF NOT EXISTS `novel_progress` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `volume_id` text NOT NULL,
  `chapter_id` text NOT NULL,
  `annotations_json` text DEFAULT '[]' NOT NULL,
  `last_read_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `novel_progress_user_chapter_idx` ON `novel_progress` (`user_id`, `chapter_id`);

CREATE TABLE IF NOT EXISTS `practice_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `module` text NOT NULL,
  `score` integer DEFAULT 0 NOT NULL,
  `total_items` integer DEFAULT 0 NOT NULL,
  `correct_items` integer DEFAULT 0 NOT NULL,
  `summary_json` text DEFAULT '{}' NOT NULL,
  `completed_at` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS `practice_sessions_user_mod_idx` ON `practice_sessions` (`user_id`, `module`, `completed_at`);
