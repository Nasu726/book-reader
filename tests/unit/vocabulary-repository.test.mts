import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { documents } from "../../src/server/db/schema.ts";
import { createSqliteVocabularyRepository } from "../../src/repositories/sqlite/vocabulary-repository.ts";
import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";

let cleanup: () => void;
let db: ReturnType<typeof createDb>;

before(() => {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-vocabulary-"));
  db = createDb(join(directory, "test.db"));
  migrate(db);
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("vocabulary persists multilingual phrases with provenance and owner scoping", async () => {
  await db.insert(documents).values({
    id: "vocab-doc",
    userId: "user-1",
    title: "Multilingual Book",
    format: "epub",
  });
  const repository = createSqliteVocabularyRepository(db);
  const location = JSON.stringify({ sectionId: "chapter-1", startOffset: 0, endOffset: 12, text: "Bonjour le monde", version: 1 });

  const created = await repository.create({
    documentId: "vocab-doc",
    location,
    meaning: "Hello world in French.",
    sourceText: "Bonjour le monde",
    term: "Bonjour le monde",
    userId: "user-1",
  });

  const owned = await repository.listByDocument("vocab-doc", "user-1");
  assert.equal(owned.length, 1);
  assert.equal(owned[0]?.term, "Bonjour le monde");
  assert.equal(owned[0]?.meaning, "Hello world in French.");
  assert.equal(owned[0]?.sourceText, "Bonjour le monde");
  assert.deepEqual(await repository.listByDocument("vocab-doc", "user-2"), []);
  assert.equal(await repository.delete(created.id, "user-2"), false);
  assert.equal(await repository.delete(created.id, "user-1"), true);
});
