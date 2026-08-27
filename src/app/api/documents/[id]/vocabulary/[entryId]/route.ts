import { cookies } from "next/headers";

import { createSqliteVocabularyRepository } from "@/repositories/sqlite/vocabulary-repository";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; entryId: string }> },
) {
  const database = createSqliteDb();
  const session = createAuthService(database).getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { entryId } = await context.params;
  const deleted = await createSqliteVocabularyRepository(
    createDrizzleFromSqlite(database),
  ).delete(entryId, session.userId);
  if (!deleted) {
    return Response.json({ error: "Vocabulary entry not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
