import { createAuthService } from "@/server/auth/service";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";

export async function POST() {
  const { createSqliteDb } = await import("@/server/db/client");
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const session = authService.getSessionUser(token);
  if (session) {
    authService.logout(session.userId);
  }

  (await cookies()).delete(SESSION_COOKIE_NAME);
  return new Response(null, {
    status: 303,
    headers: { location: "/login" },
  });
}
