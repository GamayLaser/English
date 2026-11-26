import { integer, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    usernameNormalized: text("username_normalized").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
    isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
    allowedMenus: text("allowed_menus")
      .notNull()
      .default('["cards","practice","reading","listening","writing","wrongbook"]'),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("users_username_normalized_idx").on(table.usernameNormalized)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
  ],
);

export const privateRecords = sqliteTable(
  "private_records",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    namespace: text("namespace").notNull(),
    recordKey: text("record_key").notNull(),
    value: text("value").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("private_records_unique_idx").on(table.userId, table.namespace, table.recordKey),
    index("private_records_user_ns_idx").on(table.userId, table.namespace),
  ],
);

export const contentLibrary = sqliteTable(
  "content_library",
  {
    id: text("id").primaryKey(),
    contentType: text("content_type", { enum: ["sentence", "reading", "listening"] }).notNull(),
    title: text("title"),
    content: text("content").notNull(),
    isPublished: integer("is_published", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("content_library_type_pub_idx").on(table.contentType, table.isPublished)],
);

export const aiUsageLogs = sqliteTable(
  "ai_usage_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    feature: text("feature").notNull(),
    status: text("status", { enum: ["success", "error", "rate_limited"] }).notNull(),
    durationMs: integer("duration_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("ai_usage_logs_user_created_idx").on(table.userId, table.createdAt)],
);

export const userChunks = sqliteTable(
  "user_chunks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    en: text("en").notNull(),
    zh: text("zh").notNull().default(""),
    contextSentence: text("context_sentence"),
    sourceType: text("source_type", { enum: ["novel", "show", "card", "translator"] }).notNull().default("novel"),
    sourceRef: text("source_ref"),
    masteryLevel: integer("mastery_level").notNull().default(0),
    nextReviewAt: integer("next_review_at", { mode: "timestamp_ms" }).notNull(),
    reviewCount: integer("review_count").notNull().default(0),
    mastered: integer("mastered", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("user_chunks_user_due_idx").on(table.userId, table.mastered, table.nextReviewAt),
  ],
);

export const novelProgress = sqliteTable(
  "novel_progress",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    volumeId: text("volume_id").notNull(),
    chapterId: text("chapter_id").notNull(),
    annotationsJson: text("annotations_json").notNull().default("[]"),
    lastReadAt: integer("last_read_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("novel_progress_user_chapter_idx").on(table.userId, table.chapterId),
  ],
);

export const practiceSessions = sqliteTable(
  "practice_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    module: text("module", { enum: ["translation", "reading", "writing", "listening"] }).notNull(),
    score: integer("score").notNull().default(0),
    totalItems: integer("total_items").notNull().default(0),
    correctItems: integer("correct_items").notNull().default(0),
    summaryJson: text("summary_json").notNull().default("{}"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("practice_sessions_user_mod_idx").on(table.userId, table.module, table.completedAt),
  ],
);
