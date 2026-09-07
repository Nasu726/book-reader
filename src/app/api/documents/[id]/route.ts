import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { getCurrentUser } from "@/server/auth/current-session";
import { chargeWrite } from "@/server/usage/write-budget";
import { getDatabase } from "@/server/db/database";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";
import { releaseCanonicalPaper } from "@/server/documents/shared-paper";
import { getDocumentStorage } from "@/server/storage";

const MAX_TITLE_LENGTH = 300;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const overBudget = await chargeWrite(database, session.userId);
  if (overBudget) return overBudget;

  let input: { title?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid title." }, { status: 400 });
  }
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return Response.json({ error: "Invalid title." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!await requireOwnedDocument(database, id, session.userId)) {
    return documentNotFound();
  }

  const repository = createSqliteLibraryRepository(database);
  return await repository.rename(id, session.userId, title)
    ? Response.json({ document: { id, title } })
    : documentNotFound();
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const overBudget = await chargeWrite(database, session.userId);
  if (overBudget) return overBudget;

  const { id } = await context.params;
  const document = await requireOwnedDocument(database, id, session.userId);
  if (!document) {
    return documentNotFound();
  }

  const repository = createSqliteLibraryRepository(database);
  // Read the storage reference before the row goes away, or uploaded bytes are
  // orphaned on disk/R2 with nothing left pointing at them. Canonical Paper
  // sources are remote and therefore must never be passed to DocumentStorage.
  const source = await repository.getSource(id, session.userId);
  if (!await repository.delete(id, session.userId)) {
    return documentNotFound();
  }
  if (source?.kind === "stored") {
    await (await getDocumentStorage()).delete(source.data).catch(() => undefined);
  }
  if (document.paperId) {
    // A stale retention ref is safe (it only delays Collector GC), while
    // releasing before the Reader row is gone could expose a still-live link
    // to GC. Cleanup therefore happens after the successful document delete.
    await releaseCanonicalPaper(database, document.id).catch((error) => {
      console.error(error instanceof Error ? error.message : error);
    });
  }

  return new Response(null, { status: 204 });
}
