import { cookies } from "next/headers";

import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import { createSqliteVocabularyRepository } from "@/repositories/sqlite/vocabulary-repository";
import { parseSelectionLocation } from "@/core/selection/capture";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";

function repository(database: ReturnType<typeof createSqliteDb>) {
  return createSqliteVocabularyRepository(createDrizzleFromSqlite(database));
}

async function authenticate(database: ReturnType<typeof createSqliteDb>) {
  return createAuthService(database).getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
}

async function documentForUser(database: ReturnType<typeof createSqliteDb>, id: string, userId: string) {
  const document = await createSqliteDocumentRepository(createDrizzleFromSqlite(database)).getById(id);
  return document?.userId === userId ? document : null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const session = await authenticate(database);
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!await documentForUser(database, id, session.userId)) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  return Response.json({ vocabulary: await repository(database).listByDocument(id, session.userId) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const session = await authenticate(database);
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

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
  if (!await documentForUser(database, id, session.userId)) {
    return Response.json({ error: "Document not found." }, { status: 404 });
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
