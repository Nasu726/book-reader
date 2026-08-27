import { cookies, headers } from "next/headers";
import type { Database } from "better-sqlite3";

import { createAuthService } from "./service";
import { SESSION_COOKIE_NAME } from "./session-store";
import { isCloudflareWorker } from "@/server/runtime";
import {
  ACCESS_JWT_HEADER,
  readAccessConfig,
  verifyAccessToken,
} from "./cloudflare-access";

export type AuthenticatedUser = { userId: string };

/**
 * The SQLite handle the password login needs.
 *
 * Injected from instrumentation.ts rather than imported, so better-sqlite3 —
 * a native addon a Cloudflare Worker cannot load — is referenced in exactly one
 * place. On Cloudflare this stays null and Access does the authenticating.
 */
let localAuthDatabase: Database | null = null;

export function setLocalAuthDatabase(database: Database): void {
  localAuthDatabase = database;
}

/**
 * The password login's database, or null where sign-in happens externally.
 *
 * Opened on first use rather than injected: Next.js does not guarantee that
 * instrumentation.ts and a route handler share module state. The import is
 * dynamic because better-sqlite3 is a native addon a Worker cannot load, and
 * this path is unreachable once Cloudflare Access is configured.
 */
export async function getLocalAuthDatabase(): Promise<Database | null> {
  if (readAccessConfig()) return null;
  // better-sqlite3 is a native addon; a Worker cannot load it. Reaching for it
  // there turned every page into a 500 instead of a signed-out reader.
  if (isCloudflareWorker()) return null;
  if (!localAuthDatabase) {
    const { createSqliteDb, getDatabasePath } = await import("@/server/db/client");
    localAuthDatabase = createSqliteDb(getDatabasePath());
  }
  return localAuthDatabase;
}

/**
 * The one place that decides who is making a request.
 *
 * Two ways in, chosen by configuration rather than by the caller:
 *
 * - Cloudflare Access, when CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set.
 *   Access authenticates before the request arrives and this only verifies the
 *   signed assertion, which costs about 1 ms where the password path costs
 *   51–79 ms — the difference between fitting a Worker's 10 ms CPU budget and
 *   not.
 * - The built-in password session, for local development and self-hosting.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const accessConfig = readAccessConfig();
  if (accessConfig) {
    const assertion = (await headers()).get(ACCESS_JWT_HEADER)
      ?? (await cookies()).get("CF_Authorization")?.value;
    const identity = await verifyAccessToken(assertion, accessConfig);
    return identity ? { userId: identity.userId } : null;
  }

  const database = await getLocalAuthDatabase();
  if (!database) return null;
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return createAuthService(database).getSessionUser(token);
}

/** True when sign-in is handled ahead of the application by Cloudflare Access. */
export function usesExternalAuth(): boolean {
  return readAccessConfig() !== null;
}
