import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

/**
 * Opens the database file, creating its directory first. A DATABASE_PATH that
 * points into a fresh volume is the normal case on a first boot, and
 * better-sqlite3 refuses to create missing parent directories itself.
 */
function open(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function createDb(path: string) {
  return drizzle(open(path), { schema });
}

export type Db = ReturnType<typeof createDb>;

export function createSqliteDb(path: string) {
  return open(path);
}
