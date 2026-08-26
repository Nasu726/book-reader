import { createHash, randomBytes } from "node:crypto";
import type { Database } from "better-sqlite3";

export const SESSION_COOKIE_NAME = "book_reader_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

/** Connections whose session schema is already current; see migrate-function.ts. */
const migrated = new WeakSet<Database>();

export function migrateSessions(database: Database): void {
  if (migrated.has(database)) return;
  migrated.add(database);

  // The first schema declared user_id UNIQUE, which allowed only one live
  // session per person: signing in on a phone silently signed out the laptop.
  // Sessions are disposable, so the old table is simply rebuilt.
  const existing = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'",
  ).get() as { sql?: string } | undefined;
  if (existing?.sql?.includes("UNIQUE")) {
    database.exec("DROP TABLE auth_sessions");
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
      ON auth_sessions(user_id);
  `);
  database.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(Date.now());
}

export function issueSession(
  database: Database,
  userId: string,
): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  database.prepare(`
    INSERT INTO auth_sessions (token_hash, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, userId, expiresAt.getTime());

  return { token, expiresAt };
}

/** Ends one device's session, leaving this person's other devices signed in. */
export function revokeSession(database: Database, token: string | undefined): void {
  if (!token) return;
  database.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").run(hashToken(token));
}

export function getSessionUser(
  database: Database,
  token: string | undefined,
): { userId: string } | null {
  if (!token) return null;
  const session = database.prepare(
    "SELECT user_id, expires_at FROM auth_sessions WHERE token_hash = ?",
  ).get(hashToken(token)) as { user_id: string; expires_at: number } | undefined;
  if (!session || session.expires_at <= Date.now()) {
    return null;
  }
  return { userId: session.user_id };
}

export function revokeAllSessions(database: Database, userId: string): void {
  database.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(userId);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
