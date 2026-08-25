import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { createSqliteLibraryRepository } from "../../src/repositories/sqlite/library-repository.ts";
import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";

let cleanup: () => void;
let repository: ReturnType<typeof createSqliteLibraryRepository>;

before(() => {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-library-"));
  const db = createDb(join(directory, "test.db"));
  migrate(db);
  repository = createSqliteLibraryRepository(db);
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => cleanup());

test("source updates are scoped to the owning user and report ownership", async () => {
  const documentId = "owned-upload";
  await repository.create({
    id: documentId,
    userId: "owner",
    title: "Owned upload",
    format: "pdf",
    sourceFilename: "paper.pdf",
  });

  assert.equal(await repository.updateSourceIfOwned(documentId, "attacker", "bad"), false);
  assert.equal(await repository.getSource(documentId, "attacker"), null);
  assert.equal(await repository.updateSourceIfOwned(documentId, "owner", "good"), true);
  assert.equal((await repository.getSource(documentId, "owner"))?.data, "good");
  assert.equal(await repository.delete(documentId, "attacker"), false);
  assert.equal(await repository.delete(documentId, "owner"), true);
});
