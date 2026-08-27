import { cookies } from "next/headers";

import { createSqliteHighlightRepository } from "@/repositories/sqlite/highlight-repository";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; highlightId: string }> },
) {
  const database = createSqliteDb();
  const authService = createAuthService(database);
  const session = authService.getSessionUser((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { highlightId } = await context.params;
  const deleted = await createSqliteHighlightRepository(
    createDrizzleFromSqlite(database),
  ).delete(highlightId, session.userId);
  if (!deleted) {
    return Response.json({ error: "Highlight not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
