import { cookies } from "next/headers";

import { createSqliteReadingProgressRepository } from "@/repositories/sqlite/reading-progress-repository";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";

function repository(database: ReturnType<typeof createSqliteDb>) {
  return createSqliteReadingProgressRepository(createDrizzleFromSqlite(database));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb();
  const authService = createAuthService(database);
  const session = authService.getSessionUser((await cookies()).get(SESSION_COOKIE_NAME)?.value);
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
  const database = createSqliteDb();
  const authService = createAuthService(database);
  const session = authService.getSessionUser((await cookies()).get(SESSION_COOKIE_NAME)?.value);
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
