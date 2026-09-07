import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Read-only canonical scholarly metadata owned by Paper Collector.
 *
 * These table declarations are query descriptors only. Reader migrations must
 * not create or evolve them; the shared physical D1 has a separate Collector
 * migration history (`paper_collector_migrations`).
 */
export const canonicalPapers = sqliteTable("papers", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  authorsJson: text("authors_json").notNull(),
  sourceUrl: text("source_url").notNull(),
  pdfUrl: text("pdf_url"),
});

/**
 * Collector-owned cross-application deletion guard.
 *
 * Reader is explicitly a consumer of this table: it registers one row before
 * a linked document can rely on a canonical Paper surviving Collector GC.
 */
export const paperRetentionRefs = sqliteTable(
  "paper_retention_refs",
  {
    paperId: text("paper_id").notNull(),
    owner: text("owner").notNull(),
    referenceId: text("reference_id").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.owner, table.referenceId] })],
);
