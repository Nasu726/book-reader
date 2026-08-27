
import { createSqliteHighlightRepository } from "@/repositories/sqlite/highlight-repository";
import { getCurrentUser } from "@/server/auth/current-session";
import { getDatabase } from "@/server/db/database";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; highlightId: string }> },
) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { highlightId } = await context.params;
  const deleted = await createSqliteHighlightRepository(
    database,
  ).delete(highlightId, session.userId);
  if (!deleted) {
    return Response.json({ error: "Highlight not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
