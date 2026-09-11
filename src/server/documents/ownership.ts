import { createSqliteDocumentRepository } from "@/repositories/sqlite/document-repository";
import type { DocumentRecord } from "@/repositories/types";
import type { Db } from "@/server/db/database";

/**
 * The document behind a `/api/documents/[id]/...` route, or null when it does
 * not exist or belongs to someone else.
 *
 * Every route that touches a document asks this first. The repository already
 * refuses to look a document up without its owner, so this is the one name
 * for that question rather than a check of its own.
 */
export function requireOwnedDocument(
  database: Db,
  documentId: string,
  userId: string,
): Promise<DocumentRecord | null> {
  return createSqliteDocumentRepository(database).getById(documentId, userId);
}

/** The response every route returns when the document is not the caller's. */
export function documentNotFound(): Response {
  return Response.json({ error: "Document not found." }, { status: 404 });
}
