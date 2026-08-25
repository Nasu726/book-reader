import { verifyPassword } from "./password.ts";
import { migrate } from "../db/migrate-function";
import {
  getSessionUser,
  issueSession,
  migrateSessions,
  revokeAllSessions,
} from "./session-store.ts";
import type { Database } from "better-sqlite3";

const authenticationAttempts = new Map<string, { count: number; resetAt: number }>();

export function createAuthService(database: Database) {
  migrate(database);
  migrateSessions(database);

  const username = process.env.AUTH_USERNAME;
  const passwordHash = process.env.AUTH_PASSWORD_HASH;
  async function authenticate(input: {
    username?: unknown;
    password?: unknown;
    clientKey: string;
  }): Promise<{ token: string; userId: string; expiresAt: Date } | null> {
    if (
      typeof input.username !== "string" ||
      typeof input.password !== "string" ||
      !username ||
      !passwordHash
    ) {
      return null;
    }

    if (!allowAttempt(input.clientKey)) {
      throw new Error("rate_limited");
    }

    const validUsername = input.username === username;
    const validPassword =
      (await verifyPassword(input.password, passwordHash)) &&
      validUsername;
    if (!validPassword) {
      return null;
    }

    authenticationAttempts.delete(input.clientKey);
    const session = issueSession(database, username);
    return { ...session, userId: username };
  }

  function allowAttempt(clientKey: string): boolean {
    const now = Date.now();
    const current = authenticationAttempts.get(clientKey);
    if (!current || current.resetAt <= now) {
      authenticationAttempts.set(clientKey, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return true;
    }

    current.count += 1;
    return current.count <= 10;
  }

  return {
    authenticate,
    getSessionUser(token: string | undefined) {
      return getSessionUser(database, token);
    },
    logout(userId: string) {
      revokeAllSessions(database, userId);
    },
  };
}
