import { and, eq } from "drizzle-orm";

import type { Db } from "@/server/db/database";
import {
  canonicalPapers,
  paperRetentionRefs,
} from "@/server/db/shared-paper-schema";

const READER_RETENTION_OWNER = "book-reader";

export type CanonicalPaperRecord = {
  id: string;
  title: string;
  authors: readonly string[];
  sourceUrl: string;
  pdfUrl?: string;
};

function parseAuthors(value: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((author): author is string =>
      typeof author === "string" && author.trim().length > 0
    );
  } catch {
    return [];
  }
}

export function createSharedPaperRepository(db: Db) {
  async function getById(id: string): Promise<CanonicalPaperRecord | null> {
    const rows = await db
      .select({
        id: canonicalPapers.id,
        title: canonicalPapers.title,
        authorsJson: canonicalPapers.authorsJson,
        sourceUrl: canonicalPapers.sourceUrl,
        pdfUrl: canonicalPapers.pdfUrl,
      })
      .from(canonicalPapers)
      .where(eq(canonicalPapers.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      authors: parseAuthors(row.authorsJson),
      sourceUrl: row.sourceUrl,
      pdfUrl: row.pdfUrl ?? undefined,
    };
  }

  async function retain(paperId: string, documentId: string): Promise<void> {
    await db
      .insert(paperRetentionRefs)
      .values({
        paperId,
        owner: READER_RETENTION_OWNER,
        referenceId: documentId,
      })
      .onConflictDoUpdate({
        target: [paperRetentionRefs.owner, paperRetentionRefs.referenceId],
        set: { paperId },
      });
  }

  async function release(documentId: string): Promise<void> {
    await db
      .delete(paperRetentionRefs)
      .where(and(
        eq(paperRetentionRefs.owner, READER_RETENTION_OWNER),
        eq(paperRetentionRefs.referenceId, documentId),
      ));
  }

  return { getById, retain, release };
}
