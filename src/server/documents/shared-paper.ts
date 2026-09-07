import { randomUUID } from "node:crypto";

import { createSqliteLibraryRepository } from "@/repositories/sqlite/library-repository";
import { createSharedPaperRepository } from "@/repositories/sqlite/shared-paper-repository";
import type { DocumentRecord } from "@/repositories/types";
import type { Db } from "@/server/db/database";

export type AttachCanonicalPaperResult =
  | { status: "created"; document: DocumentRecord }
  | { status: "not_found" };

/**
 * Creates Reader-owned state for a canonical Paper without copying its PDF.
 *
 * The Reader row is written first, then the Collector-owned retention guard is
 * established. If the Paper disappears between the read and guard insert, the
 * guard's production foreign key rejects the insert and the Reader row is
 * rolled back, so a successful result never exposes an unprotected link.
 */
export async function attachCanonicalPaper(
  db: Db,
  userId: string,
  paperId: string,
  createId: () => string = randomUUID,
): Promise<AttachCanonicalPaperResult> {
  const sharedPapers = createSharedPaperRepository(db);
  const paper = await sharedPapers.getById(paperId);
  if (!paper) return { status: "not_found" };

  const document: DocumentRecord = {
    id: createId(),
    userId,
    title: paper.title,
    format: "pdf",
    author: paper.authors.length > 0 ? paper.authors.join(", ") : undefined,
    paperId: paper.id,
  };
  const library = createSqliteLibraryRepository(db);
  await library.create(document);
  try {
    await sharedPapers.retain(paper.id, document.id);
  } catch (error) {
    await library.delete(document.id, userId).catch(() => undefined);
    throw error;
  }

  return { status: "created", document };
}

/**
 * Releases the shared-library deletion guard after a Reader document is gone.
 * A failure intentionally leaves a stale guard rather than risking deletion of
 * canonical metadata still referenced by a live Reader row.
 */
export async function releaseCanonicalPaper(
  db: Db,
  documentId: string,
): Promise<void> {
  await createSharedPaperRepository(db).release(documentId);
}
