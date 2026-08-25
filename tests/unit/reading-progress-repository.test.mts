import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { documents } from "../../src/server/db/schema";
import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";
import { createSqliteReadingProgressRepository } from "../../src/repositories/sqlite/reading-progress-repository.ts";

let cleanup: () => void;
let db: ReturnType<typeof createDb>;

before(() => {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-progress-"));
  db = createDb(join(directory, "test.db"));
  migrate(db);
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("reading progress upserts a stable document location", async () => {
  const baseTime = new Date("2026-08-23T00:00:00.000Z");
  await db.insert(documents).values({
    id: "progress-doc",
    userId: "user-1",
    title: "Book",
    format: "epub",
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  const repository = createSqliteReadingProgressRepository(db);

  await repository.save({
    documentId: "progress-doc",
    userId: "user-1",
    location: JSON.stringify({ version: 1, sectionId: "section-2" }),
  });
  await repository.save({
    documentId: "progress-doc",
    userId: "user-1",
    location: JSON.stringify({ version: 1, sectionId: "section-3" }),
  });

  assert.deepEqual(await repository.getByDocument("progress-doc", "user-1"), {
    documentId: "progress-doc",
    location: JSON.stringify({ version: 1, sectionId: "section-3" }),
  });
});

test("missing reading progress returns null", async () => {
  const repository = createSqliteReadingProgressRepository(db);
  assert.equal(await repository.getByDocument("missing-progress", "user-1"), null);
});

test("reading progress is scoped to its owner", async () => {
  const repository = createSqliteReadingProgressRepository(db);
  assert.equal(await repository.getByDocument("progress-doc", "user-2"), null);
});

test("progress rows cannot collide across owners", async () => {
  await db.insert(documents).values({
    id: "foreign-progress-doc",
    userId: "owner",
    title: "Foreign Book",
    format: "pdf",
  });
  const repository = createSqliteReadingProgressRepository(db);

  await repository.save({
    documentId: "foreign-progress-doc",
    userId: "owner",
    location: JSON.stringify({ page: 1, version: 1 }),
  });
  await repository.save({
    documentId: "foreign-progress-doc",
    userId: "attacker",
    location: JSON.stringify({ page: 99, version: 1 }),
  });

  assert.deepEqual(await repository.getByDocument("foreign-progress-doc", "attacker"), {
    documentId: "foreign-progress-doc",
    location: JSON.stringify({ page: 99, version: 1 }),
  });
  assert.deepEqual(await repository.getByDocument("foreign-progress-doc", "attacker"), {
    documentId: "foreign-progress-doc",
    location: JSON.stringify({ page: 99, version: 1 }),
  });
});
