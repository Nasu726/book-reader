
import { createSqliteVocabularyRepository } from "@/repositories/sqlite/vocabulary-repository";
import { parseSelectionLocation } from "@/core/selection/capture";
import { getCurrentUser } from "@/server/auth/current-session";
import { chargeWrite } from "@/server/usage/write-budget";
import { getDatabase, type Db } from "@/server/db/database";
import { documentNotFound, requireOwnedDocument } from "@/server/documents/ownership";

function repository(database: Db) {
  return createSqliteVocabularyRepository(database);
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
  return Response.json({ vocabulary: await repository(database).listByDocument(id, session.userId) });
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

  const overBudget = await chargeWrite(database, session.userId);
  if (overBudget) return overBudget;

  let input: {
    format?: unknown;
    location?: unknown;
    meaning?: unknown;
    selectedText?: unknown;
    term?: unknown;
  };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid vocabulary entry." }, { status: 400 });
  }

  if (
    typeof input.term !== "string" || !input.term.trim() || input.term.length > 500 ||
    typeof input.meaning !== "string" || !input.meaning.trim() || input.meaning.length > 5000 ||
    typeof input.selectedText !== "string" ||
    typeof input.location !== "string" ||
    (input.format !== "epub" && input.format !== "pdf") ||
    !parseSelectionLocation(JSON.stringify({
      format: input.format,
      location: input.location,
      text: input.selectedText,
      version: 1,
    }))
  ) {
    return Response.json({ error: "Invalid vocabulary entry." }, { status: 400 });
  }

  const { id } = await context.params;
  if (!await requireOwnedDocument(database, id, session.userId)) {
    return documentNotFound();
  }

  try {
    const entry = await repository(database).create({
      documentId: id,
      location: input.location,
      meaning: input.meaning.trim(),
      sourceText: input.selectedText,
      term: input.term.trim(),
      userId: session.userId,
    });
    return Response.json({ entry }, { status: 201 });
  } catch {
    return Response.json({ error: "Failed to save vocabulary entry." }, { status: 500 });
  }
}
