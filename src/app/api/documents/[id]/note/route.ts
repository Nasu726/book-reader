
import { createSqliteDocumentNoteRepository } from "@/repositories/sqlite/document-note-repository";
import { getCurrentUser } from "@/server/auth/current-session";
import { getDatabase, type Db } from "@/server/db/database";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";

function repository(database: Db) {
  return createSqliteDocumentNoteRepository(database);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const document = await requireOwnedDocument(database, id, session.userId);
  if (!document) {
    return documentNotFound();
  }
  return Response.json({ note: await repository(database).getByDocument(id, session.userId) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = await getDatabase();
  const session = await getCurrentUser();
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let input: { content?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid note." }, { status: 400 });
  }
  // An empty note is how a note is removed, so emptiness is not an error here.
  // Rejecting it left a note that could be written but never taken back.
  if (typeof input.content !== "string" || input.content.length > 100000) {
    return Response.json({ error: "Invalid note." }, { status: 400 });
  }

  const { id } = await context.params;
  const document = await requireOwnedDocument(database, id, session.userId);
  if (!document) {
    return documentNotFound();
  }

  try {
    await repository(database).save({ content: input.content.trim(), documentId: id, userId: session.userId });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Failed to save note." }, { status: 500 });
  }
}
