import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";
import { createSqliteDocumentRepository } from "../../src/repositories/sqlite/document-repository.ts";

const document = {
  id: "doc-1",
  userId: "user-1",
  title: "Test Paper",
  format: "pdf" as const,
  author: "Author",
  sourceFilename: "test.pdf",
};

let repository: ReturnType<typeof createSqliteDocumentRepository>;
let databasePath: string;
let cleanup: () => void;

before(() => {
  const dir = mkdtempSync(join(tmpdir(), "book-reader-test-"));
  databasePath = join(dir, "test.db");
  const db = createDb(databasePath);
  migrate(db);
  repository = createSqliteDocumentRepository(db);
  assert.equal(existsSync(databasePath), true);
  cleanup = () => rmSync(dir, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("document CRUD round trip", async () => {
  await repository.create(document);

  assert.deepEqual(await repository.getById(document.id), document);
  assert.equal((await repository.list()).length, 1);
});

test("document sections are ordered and upserted", async () => {
  await repository.sections.upsertMany([
    {
      documentId: document.id,
      sectionId: "section-2",
      content: "Second",
      sortOrder: 2,
    },
    {
      documentId: document.id,
      sectionId: "section-1",
      title: "Introduction",
      content: "First",
      sortOrder: 1,
    },
  ]);
  await repository.sections.upsertMany([
    {
      documentId: document.id,
      sectionId: "section-1",
      title: "Introduction updated",
      content: "First updated",
      sortOrder: 1,
    },
  ]);

  assert.deepEqual(
    (await repository.sections.listByDocument(document.id)).map(
      (section) => section.sectionId,
    ),
    ["section-1", "section-2"],
  );
  assert.equal(
    (await repository.sections.listByDocument(document.id))[0]?.title,
    "Introduction updated",
  );
});

test("deleting a document removes its sections", async () => {
  assert.equal(await repository.delete(document.id), true);
  assert.equal(await repository.delete(document.id), false);
  assert.deepEqual(await repository.sections.listByDocument(document.id), []);
});
