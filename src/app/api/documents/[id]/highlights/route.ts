
import { createSqliteHighlightRepository } from "@/repositories/sqlite/highlight-repository";
import { parseSelectionLocation } from "@/core/selection/capture";
import { getCurrentUser } from "@/server/auth/current-session";
import { getDatabase, type Db } from "@/server/db/database";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";

function repository(database: Db) {
  return createSqliteHighlightRepository(database);
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

  return Response.json({
    highlights: await repository(database).listByDocument(id, session.userId),
  });
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
  if (!await requireOwnedDocument(database, id, session.userId)) {
    return documentNotFound();
  }

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
