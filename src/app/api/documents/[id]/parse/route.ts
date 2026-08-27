import { readStoredBytes } from "@/core/documents/storage";
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { createAuthService } from "@/server/auth/service";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-store";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { parseEpub } from "@/server/documents/epub";
import { getDocumentStorage } from "@/server/storage/filesystem-document-storage";
import { cookies } from "next/headers";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb();
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
    const stored = await getDocumentStorage().get(source.data);
    if (!stored) {
      return Response.json({ error: "Document not found." }, { status: 404 });
    }
    const parsed = await parseEpub(
      await readStoredBytes(stored),
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
