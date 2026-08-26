import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

/**
 * One connection per database file, reused for the life of the process.
 *
 * Every route handler asks for the database on every request. Opening a new
 * connection each time leaked a file handle per request and paid the WAL setup
 * again; SQLite connections are safe to share within a process.
 */
const connections = new Map<string, Database.Database>();

/**
 * Opens the database file, creating its directory first. A DATABASE_PATH that
 * points into a fresh volume is the normal case on a first boot, and
 * better-sqlite3 refuses to create missing parent directories itself.
 */
function open(path: string) {
  const existing = connections.get(path);
  if (existing?.open) return existing;

  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  connections.set(path, sqlite);
  return sqlite;
}

export function createDb(path: string) {
  return drizzle(open(path), { schema });
}

export type Db = ReturnType<typeof createDb>;

/**
 * The one place that decides where the database lives.
 *
 * The application and the migration script used to disagree — `book-reader.db`
 * against `./data/book-reader.db` — so running migrations prepared a file the
 * server never opened.
 */
export function getDatabasePath(): string {
  return process.env.DATABASE_PATH ?? "./data/book-reader.db";
}

export function createSqliteDb(path: string = getDatabasePath()) {
  return open(path);
}

/**
 * A private connection the caller owns and must close.
 *
 * Backup and restore run as one-shot commands and close what they open; taking
 * the shared connection would close it out from under the running server.
 */
export function openOwnedSqliteDb(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}
