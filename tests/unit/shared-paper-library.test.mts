import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createSqliteDocumentNoteRepository } from "../../src/repositories/sqlite/document-note-repository.ts";
import { createSqliteLibraryRepository } from "../../src/repositories/sqlite/library-repository.ts";
import { createSqliteReadingProgressRepository } from "../../src/repositories/sqlite/reading-progress-repository.ts";
import { createSharedPaperRepository } from "../../src/repositories/sqlite/shared-paper-repository.ts";
import { createDb, createSqliteDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";
import {
  attachCanonicalPaper,
  releaseCanonicalPaper,
} from "../../src/server/documents/shared-paper.ts";

function createSharedFixture() {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-shared-paper-"));
  const path = join(directory, "test.db");
  const raw = createSqliteDb(path);
  migrate(raw);
  raw.exec(`
    CREATE TABLE papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      authors_json TEXT NOT NULL,
      source_url TEXT NOT NULL,
      pdf_url TEXT
    );
    CREATE TABLE paper_retention_refs (
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE RESTRICT,
      owner TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (owner, reference_id)
    );
  `);
  raw.prepare(`
    INSERT INTO papers (id, title, authors_json, source_url, pdf_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    "paper-1",
    "Canonical title",
    JSON.stringify(["Ada Author", "Ben Writer"]),
    "https://papers.example/paper-1",
    "https://papers.example/paper-1.pdf",
  );
  return {
    db: createDb(path),
    raw,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test("attaching a canonical Paper creates only Reader state plus a retention guard", async () => {
  const fixture = createSharedFixture();
  try {
    const attached = await attachCanonicalPaper(
      fixture.db,
      "reader-user",
      "paper-1",
      () => "reader-document-1",
    );
    assert.equal(attached.status, "created");
    if (attached.status !== "created") return;

    assert.deepEqual(attached.document, {
      id: "reader-document-1",
      userId: "reader-user",
      title: "Canonical title",
      format: "pdf",
      author: "Ada Author, Ben Writer",
      paperId: "paper-1",
    });

    const stored = fixture.raw.prepare(
      "SELECT paper_id, file_data FROM documents WHERE id = ?",
    ).get("reader-document-1") as { paper_id: string; file_data: string | null };
    assert.equal(stored.paper_id, "paper-1");
    assert.equal(stored.file_data, null, "canonical PDFs must not be copied into Reader storage");

    const retention = fixture.raw.prepare(
      "SELECT paper_id, owner, reference_id FROM paper_retention_refs WHERE owner = 'book-reader' AND reference_id = ?",
    ).get("reader-document-1");
    assert.deepEqual(retention, {
      paper_id: "paper-1",
      owner: "book-reader",
      reference_id: "reader-document-1",
    });

    const source = await createSqliteLibraryRepository(fixture.db).getSource(
      "reader-document-1",
      "reader-user",
    );
    assert.deepEqual(source, {
      kind: "canonical-paper",
      filename: null,
      format: "pdf",
      paperId: "paper-1",
    });

    const progress = createSqliteReadingProgressRepository(fixture.db);
    const notes = createSqliteDocumentNoteRepository(fixture.db);
    await progress.save({
      documentId: "reader-document-1",
      userId: "reader-user",
      location: "pdf:7",
    });
    await notes.save({
      documentId: "reader-document-1",
      userId: "reader-user",
      content: "Reader-owned note",
    });
    assert.equal(
      (await progress.getByDocument("reader-document-1", "reader-user"))?.location,
      "pdf:7",
    );
    assert.equal(
      (await notes.getByDocument("reader-document-1", "reader-user"))?.content,
      "Reader-owned note",
    );

    // Reader-local renames remain local snapshots/customization and never write
    // back to Collector-owned scholarly metadata.
    await createSqliteLibraryRepository(fixture.db).rename(
      "reader-document-1",
      "reader-user",
      "My reading title",
    );
    const canonicalTitle = fixture.raw.prepare(
      "SELECT title FROM papers WHERE id = 'paper-1'",
    ).get() as { title: string };
    assert.equal(canonicalTitle.title, "Canonical title");
  } finally {
    fixture.cleanup();
  }
});

test("retention blocks canonical deletion until Reader releases its link", async () => {
  const fixture = createSharedFixture();
  try {
    await attachCanonicalPaper(
      fixture.db,
      "reader-user",
      "paper-1",
      () => "reader-document-2",
    );

    assert.throws(
      () => fixture.raw.prepare("DELETE FROM papers WHERE id = 'paper-1'").run(),
      /FOREIGN KEY constraint failed/,
    );

    await createSqliteLibraryRepository(fixture.db).delete(
      "reader-document-2",
      "reader-user",
    );
    await releaseCanonicalPaper(fixture.db, "reader-document-2");
    const retentionCount = fixture.raw.prepare(
      "SELECT COUNT(*) AS count FROM paper_retention_refs",
    ).get() as { count: number };
    assert.equal(retentionCount.count, 0);
    fixture.raw.prepare("DELETE FROM papers WHERE id = 'paper-1'").run();
    const paperCount = fixture.raw.prepare(
      "SELECT COUNT(*) AS count FROM papers",
    ).get() as { count: number };
    assert.equal(paperCount.count, 0);
  } finally {
    fixture.cleanup();
  }
});

test("missing canonical Papers do not leave orphan Reader documents", async () => {
  const fixture = createSharedFixture();
  try {
    const result = await attachCanonicalPaper(
      fixture.db,
      "reader-user",
      "missing-paper",
      () => "must-not-exist",
    );
    assert.deepEqual(result, { status: "not_found" });
    const documentCount = fixture.raw.prepare(
      "SELECT COUNT(*) AS count FROM documents",
    ).get() as { count: number };
    assert.equal(documentCount.count, 0);
    const retentionCount = fixture.raw.prepare(
      "SELECT COUNT(*) AS count FROM paper_retention_refs",
    ).get() as { count: number };
    assert.equal(retentionCount.count, 0);
  } finally {
    fixture.cleanup();
  }
});

test("shared repository tolerates malformed author JSON without losing the Paper", async () => {
  const fixture = createSharedFixture();
  try {
    fixture.raw.prepare("UPDATE papers SET authors_json = 'not-json' WHERE id = 'paper-1'").run();
    const paper = await createSharedPaperRepository(fixture.db).getById("paper-1");
    assert.equal(paper?.title, "Canonical title");
    assert.deepEqual(paper?.authors, []);
  } finally {
    fixture.cleanup();
  }
});
