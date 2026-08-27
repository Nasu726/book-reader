import { cookies, headers } from "next/headers";

import { createAuthService } from "./service";
import { SESSION_COOKIE_NAME } from "./session-store";
import {
  ACCESS_JWT_HEADER,
  readAccessConfig,
  verifyAccessToken,
} from "./cloudflare-access";
import type { createSqliteDb } from "@/server/db/client";

export type AuthenticatedUser = { userId: string };

/**
 * The one place that decides who is making a request.
 *
 * Two ways in, chosen by configuration rather than by the caller:
 *
 * - Cloudflare Access, when CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set.
 *   Access authenticates before the request arrives and this only verifies the
 *   signed assertion, which is what makes the deployment fit inside a Worker's
 *   10 ms CPU budget.
 * - The built-in password session, for local development and self-hosting,
 *   where scrypt's cost is affordable.
 */
export async function getCurrentUser(
  database: ReturnType<typeof createSqliteDb>,
): Promise<AuthenticatedUser | null> {
  const accessConfig = readAccessConfig();
  if (accessConfig) {
    const assertion = (await headers()).get(ACCESS_JWT_HEADER)
      ?? (await cookies()).get("CF_Authorization")?.value;
    const identity = await verifyAccessToken(assertion, accessConfig);
    return identity ? { userId: identity.userId } : null;
  }

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  return createAuthService(database).getSessionUser(token);
}

/** True when sign-in is handled ahead of the application by Cloudflare Access. */
export function usesExternalAuth(): boolean {
  return readAccessConfig() !== null;
}
