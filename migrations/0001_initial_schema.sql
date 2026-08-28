-- Initial schema for D1.
--
-- Mirrors src/server/db/migrate-function.ts, which builds the same tables for
-- the local better-sqlite3 file. Two copies exist because the two runtimes
-- migrate differently: locally the schema is applied on first connection, on
-- Cloudflare it is applied by `wrangler d1 migrations apply`.
--
-- auth_sessions is deliberately absent. Sign-in on Cloudflare is handled by
-- Access before the request arrives, so there is no session for this database
-- to keep.

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
  author TEXT,
  source_filename TEXT,
  file_data TEXT,
  last_opened_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_sections (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (document_id, section_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  location TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  location TEXT NOT NULL,
  selected_text TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  selected_text TEXT,
  location TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_notes (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS vocabulary (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  term TEXT NOT NULL,
  meaning TEXT NOT NULL,
  source_text TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Every read is scoped to one person and usually to one document.
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_highlights_document_user ON highlights(document_id, user_id);
CREATE INDEX IF NOT EXISTS idx_vocabulary_document_user ON vocabulary(document_id, user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_document_user ON conversations(document_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
