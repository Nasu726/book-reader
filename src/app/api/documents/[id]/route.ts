import { cookies } from "next/headers";

import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";
import { getDocumentStorage } from "@/server/storage/filesystem-document-storage";

const MAX_TITLE_LENGTH = 300;

async function authenticate(database: ReturnType<typeof createSqliteDb>) {
  return createAuthService(database).getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb();
  const session = await authenticate(database);
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

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

  const repository = createSqliteLibraryRepository(createDrizzleFromSqlite(database));
  return await repository.rename(id, session.userId, title)
    ? Response.json({ document: { id, title } })
    : documentNotFound();
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb();
  const session = await authenticate(database);
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const document = await requireOwnedDocument(database, id, session.userId);
  if (!document) {
    return documentNotFound();
  }

  const repository = createSqliteLibraryRepository(createDrizzleFromSqlite(database));
  // Read the storage reference before the row goes away, or the bytes are
  // orphaned on disk with nothing left pointing at them.
  const source = await repository.getSource(id, session.userId);
  if (!await repository.delete(id, session.userId)) {
    return documentNotFound();
  }
  if (source) {
    await getDocumentStorage().delete(source.data).catch(() => undefined);
  }

  return new Response(null, { status: 204 });
}
