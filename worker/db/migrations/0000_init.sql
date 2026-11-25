CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  allowed_menus TEXT NOT NULL DEFAULT '["cards","practice","reading","listening","writing","wrongbook"]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_normalized_idx ON users (username_normalized);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS private_records (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  namespace TEXT NOT NULL,
  record_key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS private_records_unique_idx ON private_records (user_id, namespace, record_key);
CREATE INDEX IF NOT EXISTS private_records_user_ns_idx ON private_records (user_id, namespace);

CREATE TABLE IF NOT EXISTS content_library (
  id TEXT PRIMARY KEY NOT NULL,
  content_type TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_library_type_pub_idx ON content_library (content_type, is_published);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_usage_logs_user_created_idx ON ai_usage_logs (user_id, created_at);

-- Default dev user so private_records and ai_usage_logs work without login during development
INSERT OR IGNORE INTO users (id, username, username_normalized, password_hash, role, is_enabled, created_at, updated_at)
VALUES ('dev-user', 'dev', 'dev', 'disabled-during-dev', 'admin', 1, 0, 0);
