import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import type { DocumentRecord } from "@/repositories/types";
import { createDrizzleFromSqlite } from "@/server/db/database-bridge";
import type { createSqliteDb } from "@/server/db/client";

/**
 * The document behind a `/api/documents/[id]/...` route, or null when it does
 * not exist or belongs to someone else.
 *
 * Every route that writes something attached to a document has to ask this
 * first. Three routes had grown their own copy of the check under three names,
 * and the one route that forgot it — the highlight POST — accepted writes
 * against any document id at all.
 */
export async function requireOwnedDocument(
  database: ReturnType<typeof createSqliteDb>,
  documentId: string,
  userId: string,
): Promise<DocumentRecord | null> {
  const document = await createSqliteDocumentRepository(
    createDrizzleFromSqlite(database),
  ).getById(documentId);
  return document?.userId === userId ? document : null;
}

/** The response every route returns when the document is not the caller's. */
export function documentNotFound(): Response {
  return Response.json({ error: "Document not found." }, { status: 404 });
}
