import { and, eq } from "drizzle-orm";

import { documentNotes } from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import type { DocumentNoteRecord, DocumentNoteRepository } from "../types";

type DocumentNoteRow = typeof documentNotes.$inferSelect;

function toRecord(row: DocumentNoteRow): DocumentNoteRecord {
  return {
    content: row.content,
    documentId: row.documentId,
    updatedAt: row.updatedAt,
  };
}

export function createSqliteDocumentNoteRepository(db: Db): DocumentNoteRepository {
  return {
    async getByDocument(documentId, userId) {
      const rows = await db
        .select()
        .from(documentNotes)
        .where(and(
          eq(documentNotes.documentId, documentId),
          eq(documentNotes.userId, userId),
        ))
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async save(input) {
      const updatedAt = new Date();
      const updated = await db
        .update(documentNotes)
        .set({ content: input.content, updatedAt })
        .where(and(
          eq(documentNotes.documentId, input.documentId),
          eq(documentNotes.userId, input.userId),
        ))
        .returning({ documentId: documentNotes.documentId });

      if (updated.length > 0) return;

      const existing = await db
        .select({ documentId: documentNotes.documentId })
        .from(documentNotes)
        .where(eq(documentNotes.documentId, input.documentId))
        .limit(1);
      if (existing.length > 0) {
        throw new Error("Document note is owned by another user.");
      }

      await db.insert(documentNotes).values({ ...input, updatedAt }).onConflictDoNothing({
        target: documentNotes.documentId,
      });
    },
  };
}
