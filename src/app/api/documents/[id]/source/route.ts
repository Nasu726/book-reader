
import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import { createSqliteDb } from "@/server/db/client";
import { getCurrentUser } from "@/server/auth/current-session";
import { getDocumentStorage } from "@/server/storage/filesystem-document-storage";

const CONTENT_TYPES = {
  epub: "application/epub+zip",
  pdf: "application/pdf",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const database = createSqliteDb();
  const session = await getCurrentUser(database);
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

  const stored = await getDocumentStorage().get(source.data);
  if (!stored) {
    return Response.json({ error: "Document not found." }, { status: 404 });
  }

  // Streamed as bytes: a base64 payload would cost a third more transfer and
  // force the whole document through memory on both ends.
  return new Response(stored.stream, {
    headers: {
      "cache-control": "private, no-store",
      "content-length": String(stored.size),
      "content-type": CONTENT_TYPES[source.format] ?? stored.contentType,
      "x-content-type-options": "nosniff",
    },
  });
}
