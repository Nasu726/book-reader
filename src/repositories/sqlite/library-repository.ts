import { and, eq } from "drizzle-orm";

import type { Db } from "@/server/db/client";
import {
  documents,
  readingProgress,
} from "@/server/db/schema";
import type {
  DocumentRecord,
  LibraryItem,
  LibraryRepository,
} from "../types";

export function createSqliteLibraryRepository(db: Db): LibraryRepository {
  async function list(userId: string): Promise<readonly LibraryItem[]> {
    const rows = await db.select().from(documents).where(eq(documents.userId, userId));
    const progressRows = await db.select().from(readingProgress).where(eq(readingProgress.userId, userId));
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      title: row.title,
      format: row.format,
      author: row.author ?? undefined,
      sourceFilename: row.sourceFilename ?? undefined,
      lastOpenedAt: row.lastOpenedAt ?? undefined,
      progress: progressRows.find((p) => p.documentId === row.id)?.location ? 1 : 0,
    }));
  }

  async function create(document: DocumentRecord): Promise<void> {
    await db.insert(documents).values({
      id: document.id,
      userId: document.userId,
      title: document.title,
      format: document.format,
      author: document.author ?? null,
      sourceFilename: document.sourceFilename ?? null,
      fileData: null,
    });
  }

  async function markOpened(id: string, userId: string, openedAt = new Date()): Promise<void> {
    await db
      .update(documents)
      .set({ lastOpenedAt: openedAt, updatedAt: openedAt })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  async function updateSource(id: string, userId: string, data: string): Promise<void> {
    await db.update(documents).set({ fileData: data, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
  }

  async function updateSourceIfOwned(
    id: string,
    expectedUserId: string,
    data: string,
  ): Promise<boolean> {
    const result = await db.update(documents)
      .set({ fileData: data, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.userId, expectedUserId)))
      .returning({ id: documents.id });
    return result.length > 0;
  }

  async function rename(id: string, userId: string, title: string): Promise<boolean> {
    const result = await db.update(documents)
      .set({ title, updatedAt: new Date() })
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning({ id: documents.id });
    return result.length > 0;
  }

  async function remove(id: string, userId: string): Promise<boolean> {
    const result = await db.delete(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
      .returning({ id: documents.id });
    return result.length > 0;
  }

  async function getSource(id: string, userId: string) {
    const row = await db.select({
      data: documents.fileData,
      format: documents.format,
      sourceFilename: documents.sourceFilename,
    }).from(documents).where(and(eq(documents.id, id), eq(documents.userId, userId))).limit(1);
    const document = row[0];
    if (!document?.data) return null;
    return { filename: document.sourceFilename ?? null, format: document.format, data: document.data };
  }

  return { list, create, delete: remove, rename, updateSource, updateSourceIfOwned, markOpened, getSource };
}
