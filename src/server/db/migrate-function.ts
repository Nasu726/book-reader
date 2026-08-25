import type { Database } from "better-sqlite3";
import type { Db } from "./client.js";

type SqliteMigratable = Database | Db;

export function migrate(database: SqliteMigratable) {
  const db = (
    "$client" in database ? database.$client : database
  ) as Database;
  db.exec(`
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
    )
  `);
  const columns = db.prepare("PRAGMA table_info(documents)").all() as { name: string }[];
  if (!columns.some((column) => column.name === "file_data")) {
    db.exec("ALTER TABLE documents ADD COLUMN file_data TEXT");
  }
  if (!columns.some((column) => column.name === "last_opened_at")) {
    db.exec("ALTER TABLE documents ADD COLUMN last_opened_at INTEGER");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_sections (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (document_id, section_id)
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS reading_progress (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      location TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec(`
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_notes (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS vocabulary (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      term TEXT NOT NULL,
      meaning TEXT NOT NULL,
      source_text TEXT NOT NULL,
      location TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      selected_text TEXT,
      location TEXT,
      created_at INTEGER NOT NULL
    )
  `);
}
