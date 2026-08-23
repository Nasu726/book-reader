import { eq } from "drizzle-orm";

import {
  readingProgress,
} from "@/server/db/schema";
import type { Db } from "@/server/db/client";
import type { ReadingProgressRepository } from "../types";

export function createSqliteReadingProgressRepository(
  db: Db,
): ReadingProgressRepository {
  async function getByDocument(documentId: string) {
    const rows = await db.select({
      documentId: readingProgress.documentId,
      location: readingProgress.location,
    }).from(readingProgress).where(eq(readingProgress.documentId, documentId)).limit(1);
    return rows[0] ?? null;
  }

  async function save(input: {
    documentId: string;
    userId: string;
    location: string;
  }): Promise<void> {
    const updatedAt = new Date();
    await db
      .insert(readingProgress)
      .values({ ...input, updatedAt })
      .onConflictDoUpdate({
        target: readingProgress.documentId,
        set: { location: input.location, userId: input.userId, updatedAt },
      });
  }

  return {
    getByDocument: async (documentId) => getByDocument(documentId),
    save,
  };
}
