import { cookies } from "next/headers";

import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import { createSqliteHighlightRepository } from "@/repositories/sqlite/highlight-repository";
import { parseSelectionLocation } from "@/core/selection/capture";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";

function repository(database: ReturnType<typeof createSqliteDb>) {
  return createSqliteHighlightRepository(createDrizzleFromSqlite(database));
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
  const document = await createSqliteDocumentRepository(
    createDrizzleFromSqlite(database),
  ).getById(id);
  if (!document || document.userId !== session.userId) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  return Response.json({
    highlights: await repository(database).listByDocument(id, session.userId),
  });
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

  let input: {
    format?: unknown;
    location?: unknown;
    selectedText?: unknown;
    note?: unknown;
  };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid highlight." }, { status: 400 });
  }

  if (
    typeof input.location !== "string" ||
    typeof input.selectedText !== "string" ||
    (input.format !== "epub" && input.format !== "pdf") ||
    !input.selectedText.trim() ||
    !parseSelectionLocation(JSON.stringify({
      format: input.format,
      location: input.location,
      text: input.selectedText,
      version: 1,
    }))
  ) {
    return Response.json({ error: "Invalid highlight." }, { status: 400 });
  }

  const { id } = await context.params;
  try {
    const highlight = await repository(database).create({
      documentId: id,
      location: input.location,
      note: typeof input.note === "string" && input.note.trim() ? input.note : undefined,
      selectedText: input.selectedText,
      userId: session.userId,
    });
    return Response.json({ highlight }, { status: 201 });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    return Response.json({ error: "Failed to save highlight." }, { status: 500 });
  }
}
