import { randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import { highlights } from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import type { HighlightRecord, HighlightRepository } from "../types";

type HighlightRow = typeof highlights.$inferSelect;

function toRecord(row: HighlightRow): HighlightRecord {
  return {
    color: row.color,
    createdAt: row.createdAt,
    documentId: row.documentId,
    id: row.id,
    location: row.location,
    note: row.note ?? undefined,
    selectedText: row.selectedText,
  };
}

export function createSqliteHighlightRepository(db: Db): HighlightRepository {
  return {
    async listByDocument(documentId, userId) {
      const rows = await db
        .select()
        .from(highlights)
        .where(and(eq(highlights.documentId, documentId), eq(highlights.userId, userId)))
        .orderBy(asc(highlights.createdAt));
      return rows.map(toRecord);
    },
    async create(input) {
      const [row] = await db
        .insert(highlights)
        .values({ ...input, id: randomUUID() })
        .returning();
      if (!row) throw new Error("Failed to create highlight.");
      return toRecord(row);
    },
    async delete(id, userId) {
      const deleted = await db
        .delete(highlights)
        .where(and(eq(highlights.id, id), eq(highlights.userId, userId)))
        .returning({ id: highlights.id });
      return deleted.length > 0;
    },
  };
}
