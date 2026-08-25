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
    const rows = db.select().from(documents).all();

    return rows.map(toDocumentRecord);
  };

  const getById = async (
    id: string,
  ): Promise<DocumentRecord | null> => {
    const row = db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .get();

    return row ? toDocumentRecord(row) : null;
  };

  const create = async (input: DocumentRecord): Promise<void> => {
    db.insert(documents)
      .values({
        id: input.id,
        userId: input.userId,
        title: input.title,
        format: input.format,
        author: input.author ?? null,
        sourceFilename: input.sourceFilename ?? null,
      })
      .run();
  };

  const deleteById = async (id: string): Promise<boolean> => {
    const result = db
      .delete(documents)
      .where(eq(documents.id, id))
      .run();

    return result.changes > 0;
  };

  const sections: DocumentSectionRepository = {
    listByDocument: async (
      documentId: string,
    ): Promise<readonly DocumentSectionRecord[]> => {
      const rows = db
        .select()
        .from(documentSections)
        .where(eq(documentSections.documentId, documentId))
        .orderBy(documentSections.sortOrder)
        .all();

      return rows.map(toSectionRecord);
    },

    upsertMany: async (
      input: readonly DocumentSectionRecord[],
    ): Promise<void> => {
      if (input.length === 0) return;

      for (const section of input) {
        db.insert(documentSections)
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
          })
          .run();
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
