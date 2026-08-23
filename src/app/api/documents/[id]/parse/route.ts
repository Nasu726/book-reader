import { parseHTML } from "linkedom";

import { EpubParser } from "@/core/documents/epub-parser";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { cookies } from "next/headers";

class LinkedomTextParser {
  parseFromString(markup: string) {
    return parseHTML(markup).document;
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb(process.env.DATABASE_PATH ?? "book-reader.db");
  const authService = createAuthService(database);
  const session = authService.getSessionUser(
    (await cookies()).get(SESSION_COOKIE_NAME)?.value,
  );
  if (!session) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id } = await context.params;
  const source = await createSqliteLibraryRepository(
    createDrizzleFromSqlite(database),
  ).getSource(id, session.userId);
  if (!source) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }
  if (source.format !== "epub") {
    return Response.json({ error: "This document is not an EPUB." }, { status: 415 });
  }

  try {
    const response = await fetch(source.data);
    const data = await response.arrayBuffer();
    const parsed = await new EpubParser(LinkedomTextParser).parse(
      data,
      source.filename ?? "document.epub",
    );
    return Response.json(parsed, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "The document could not be opened." },
      { status: 422 },
    );
  }
}
