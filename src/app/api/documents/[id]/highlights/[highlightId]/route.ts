
import { createSqliteHighlightRepository } from "@/repositories/sqlite/highlight-repository";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/current-session";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; highlightId: string }> },
) {
  const database = createSqliteDb();
  const session = await getCurrentUser(database);
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
