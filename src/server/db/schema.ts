import { DEFAULT_HIGHLIGHT_COLOR, HIGHLIGHT_COLORS } from "@/core/highlights/colors";
import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  format: text("format", { enum: ["epub", "pdf"] }).notNull(),
  author: text("author"),
  sourceFilename: text("source_filename"),
  fileData: text("file_data"),
  lastOpenedAt: integer("last_opened_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const documentSections = sqliteTable(
  "document_sections",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    sectionId: text("section_id").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.sectionId] })],
);

export const readingProgress = sqliteTable(
  "reading_progress",
  {
    documentId: text("document_id")
      .primaryKey()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    location: text("location").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export type ReadingProgressInsert = typeof readingProgress.$inferInsert;

export const highlights = sqliteTable("highlights", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  location: text("location").notNull(),
  selectedText: text("selected_text").notNull(),
  note: text("note"),
  color: text("color", { enum: HIGHLIGHT_COLORS }).notNull().default(DEFAULT_HIGHLIGHT_COLOR),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const documentNotes = sqliteTable("document_notes", {
  documentId: text("document_id")
    .primaryKey()
    .references(() => documents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const vocabulary = sqliteTable("vocabulary", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  term: text("term").notNull(),
  meaning: text("meaning").notNull(),
  sourceText: text("source_text").notNull(),
  location: text("location").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  selectedText: text("selected_text"),
  location: text("location"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * One row per person per UTC day, counting write requests.
 *
 * D1's free tier allows 100,000 rows written a day for the whole account, and
 * an account with no payment method does not spill over into billing — it
 * starts refusing writes. A runaway client, a mistake, or an attack would
 * therefore take the day's budget with it and leave the reader looking at
 * unexplained 500s. Counting here lets the application refuse first, in words,
 * and keep the rest of the day.
 */
export const usageCounters = sqliteTable(
  "usage_counters",
  {
    userId: text("user_id").notNull(),
    /** UTC calendar day, YYYY-MM-DD. */
    day: text("day").notNull(),
    writes: integer("writes").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] })],
);
