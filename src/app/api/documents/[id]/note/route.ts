import { cookies } from "next/headers";

import { createAuthService } from "@/server/auth/service";
import { createSqliteDocumentNoteRepository } from "@/repositories/sqlite/document-note-repository";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";

async function authenticate(database: ReturnType<typeof createSqliteDb>) {
  const authService = createAuthService(database);
  return authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
}

function repository(database: ReturnType<typeof createSqliteDb>) {
  return createSqliteDocumentNoteRepository(createDrizzleFromSqlite(database));
}

export async function GET(
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
  return Response.json({ note: await repository(database).getByDocument(id, session.userId) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb();
  const session = await authenticate(database);
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  let input: { content?: unknown };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid note." }, { status: 400 });
  }
  if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 100000) {
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
