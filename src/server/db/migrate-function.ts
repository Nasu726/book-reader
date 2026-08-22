import type { Db } from "./client.js";

export function migrate(db: Db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      format TEXT NOT NULL CHECK (format IN ('epub', 'pdf')),
      author TEXT,
      source_filename TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS document_sections (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (document_id, section_id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      location TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      location TEXT NOT NULL,
      selected_text TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
}
