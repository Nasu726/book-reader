import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { documents } from "../../src/server/db/schema.ts";
import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";
import { createSqliteHighlightRepository } from "../../src/repositories/sqlite/highlight-repository.ts";

let cleanup: () => void;
let db: ReturnType<typeof createDb>;

before(() => {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-highlights-"));
  db = createDb(join(directory, "test.db"));
  migrate(db);
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("highlights persist, restore by owner, and delete securely", async () => {
  await db.insert(documents).values({
    id: "highlight-doc",
    userId: "user-1",
    title: "Book",
    format: "pdf",
  });
  const repository = createSqliteHighlightRepository(db);

  const created = await repository.create({
    documentId: "highlight-doc",
    location: JSON.stringify({ page: 2, source: "text-layer-viewport", version: 1 }),
    selectedText: "Important idea.",
    userId: "user-1",
  });

  assert.equal(await repository.listByDocument("highlight-doc", "user-1").then((items) => items.length), 1);
  assert.deepEqual(
    await repository.listByDocument("highlight-doc", "user-2"),
    [],
  );
  assert.equal(await repository.delete(created.id, "user-2"), false);
  assert.equal(await repository.delete(created.id, "user-1"), true);
  assert.deepEqual(await repository.listByDocument("highlight-doc", "user-1"), []);
});
