import { eq } from "drizzle-orm";

import type { Db } from "../../server/db/client";
import {
  documents,
  documentSections,
} from "../../server/db/schema";
import type {
  DocumentRecord,
  DocumentRepository,
  DocumentSectionRecord,
  DocumentSectionRepository,
} from "../types";

function toDocumentRecord(row: typeof documents.$inferSelect): DocumentRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    format: row.format,
    author: row.author ?? undefined,
    sourceFilename: row.sourceFilename ?? undefined,
  };
}

function toSectionRecord(
  row: typeof documentSections.$inferSelect,
): DocumentSectionRecord {
  return {
    documentId: row.documentId,
    sectionId: row.sectionId,
    title: row.title ?? undefined,
    content: row.content,
    sortOrder: row.sortOrder,
  };
}

export function createSqliteDocumentRepository(
  db: Db,
): DocumentRepository & { sections: DocumentSectionRepository } {
  const list = async (): Promise<readonly DocumentRecord[]> => {
    const rows = await db.select().from(documents);

    return rows.map(toDocumentRecord);
  };

  const getById = async (
    id: string,
  ): Promise<DocumentRecord | null> => {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);

    return rows[0] ? toDocumentRecord(rows[0]) : null;
  };

  const create = async (input: DocumentRecord): Promise<void> => {
    await db.insert(documents)
      .values({
        id: input.id,
        userId: input.userId,
        title: input.title,
        format: input.format,
        author: input.author ?? null,
        sourceFilename: input.sourceFilename ?? null,
      });
  };

  const deleteById = async (id: string): Promise<boolean> => {
    // `.returning()` rather than a driver-specific row count: better-sqlite3
    // reports `changes`, D1 reports `meta.changes`, and this works on both.
    const deleted = await db
      .delete(documents)
      .where(eq(documents.id, id))
      .returning({ id: documents.id });

    return deleted.length > 0;
  };

  const sections: DocumentSectionRepository = {
    listByDocument: async (
      documentId: string,
    ): Promise<readonly DocumentSectionRecord[]> => {
      const rows = await db
        .select()
        .from(documentSections)
        .where(eq(documentSections.documentId, documentId))
        .orderBy(documentSections.sortOrder);

      return rows.map(toSectionRecord);
    },

    upsertMany: async (
      input: readonly DocumentSectionRecord[],
    ): Promise<void> => {
      if (input.length === 0) return;

      for (const section of input) {
        // Awaited, not just built: a drizzle query only runs when it is awaited
        // or given a driver-specific terminator, and the terminators are the
        // part that does not survive D1.
        await db.insert(documentSections)
          .values({
            documentId: section.documentId,
            sectionId: section.sectionId,
            title: section.title ?? null,
            content: section.content,
            sortOrder: section.sortOrder,
          })
          .onConflictDoUpdate({
            target: [
              documentSections.documentId,
              documentSections.sectionId,
            ],
            set: {
              title: section.title ?? null,
              content: section.content,
              sortOrder: section.sortOrder,
            },
          });
      }
    },
  };

  return {
    list,
    getById,
    create,
    delete: deleteById,
    sections,
  };
}
