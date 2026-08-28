
import { createSqliteVocabularyRepository } from "@/repositories/sqlite/vocabulary-repository";
import { getCurrentUser } from "@/server/auth/current-session";
import { chargeWrite } from "@/server/usage/write-budget";
import { getDatabase } from "@/server/db/database";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; entryId: string }> },
) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const overBudget = await chargeWrite(database, session.userId);
  if (overBudget) return overBudget;

  const { entryId } = await context.params;
  const deleted = await createSqliteVocabularyRepository(
    database,
  ).delete(entryId, session.userId);
  if (!deleted) {
    return Response.json({ error: "Vocabulary entry not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
