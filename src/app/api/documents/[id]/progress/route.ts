
import { createSqliteReadingProgressRepository } from "@/repositories/sqlite/reading-progress-repository";
import { getCurrentUser } from "@/server/auth/current-session";
import { getDatabase, type Db } from "@/server/db/database";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";

function repository(database: Db) {
  return createSqliteReadingProgressRepository(database);
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
  if (!await requireOwnedDocument(database, id, session.userId)) {
    return documentNotFound();
  }

  const progress = await repository(database).getByDocument(id, session.userId);
  return Response.json({ location: progress?.location ?? null });
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

  let input: { location?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid progress." }, { status: 400 });
  }
  if (typeof input.location !== "string" || !input.location.trim()) {
    return Response.json({ error: "Invalid progress." }, { status: 400 });
  }
  const { id } = await context.params;
  if (!await requireOwnedDocument(database, id, session.userId)) {
    return documentNotFound();
  }

  await repository(database).save({
    documentId: id,
    userId: session.userId,
    location: input.location,
  });
  return Response.json({ ok: true });
}
