import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { vocabulary } from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import type { VocabularyRecord, VocabularyRepository } from "../types";

type VocabularyRow = typeof vocabulary.$inferSelect;

function toRecord(row: VocabularyRow): VocabularyRecord {
  return {
    createdAt: row.createdAt,
    documentId: row.documentId,
    id: row.id,
    location: row.location,
    meaning: row.meaning,
    sourceText: row.sourceText,
    term: row.term,
  };
}

export function createSqliteVocabularyRepository(db: Db): VocabularyRepository {
  return {
    async listByDocument(documentId, userId) {
      const rows = await db
        .select()
        .from(vocabulary)
        .where(and(eq(vocabulary.documentId, documentId), eq(vocabulary.userId, userId)))
        .orderBy(asc(vocabulary.createdAt));
      return rows.map(toRecord);
    },
    async create(input) {
      const [row] = await db
        .insert(vocabulary)
        .values({ ...input, id: randomUUID() })
        .returning();
      if (!row) throw new Error("Failed to create vocabulary entry.");
      return toRecord(row);
    },
    async delete(id, userId) {
      const deleted = await db
        .delete(vocabulary)
        .where(and(eq(vocabulary.id, id), eq(vocabulary.userId, userId)))
        .returning({ id: vocabulary.id });
      return deleted.length > 0;
    },
  };
}
