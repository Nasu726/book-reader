import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { documents } from "../../src/server/db/schema.ts";
import { createSqliteDocumentNoteRepository } from "../../src/repositories/sqlite/document-note-repository.ts";
import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";

let cleanup: () => void;
let db: ReturnType<typeof createDb>;

before(() => {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-document-notes-"));
  db = createDb(join(directory, "test.db"));
  migrate(db);
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("document notes upsert for their owner and do not collide across owners", async () => {
  await db.insert(documents).values({
    id: "note-doc",
    userId: "user-1",
    title: "Book",
    format: "epub",
  });
  const repository = createSqliteDocumentNoteRepository(db);

  await repository.save({ content: "First draft.", documentId: "note-doc", userId: "user-1" });
  await repository.save({ content: "Revised note.", documentId: "note-doc", userId: "user-1" });

  const owned = await repository.getByDocument("note-doc", "user-1");
  assert.equal(owned?.content, "Revised note.");
  assert.deepEqual(await repository.getByDocument("note-doc", "user-2"), null);

  await assert.rejects(
    repository.save({ content: "Other owner.", documentId: "note-doc", userId: "user-2" }),
    /owned by another user/,
  );
  assert.equal((await repository.getByDocument("note-doc", "user-1"))?.content, "Revised note.");
  assert.deepEqual(await repository.getByDocument("note-doc", "user-2"), null);
});
