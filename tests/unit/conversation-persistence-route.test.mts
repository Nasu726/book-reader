import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { documents } from "../../src/server/db/schema.ts";
import { createSqliteConversationRepository } from "../../src/repositories/sqlite/conversation-repository.ts";
import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";

let cleanup: () => void;
let db: ReturnType<typeof createDb>;

before(() => {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-conversation-persistence-"));
  db = createDb(join(directory, "test.db"));
  migrate(db);
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("document conversations resolve only for their owner", async () => {
  await db.insert(documents).values({
    id: "conversation-doc",
    userId: "user-1",
    title: "Book",
    format: "epub",
  });
  const repository = createSqliteConversationRepository(db);
  await repository.create("conversation-owned", "conversation-doc", "user-1");

  assert.equal(await repository.getByDocument("conversation-doc", "user-1"), "conversation-owned");
  assert.equal(await repository.getByDocument("conversation-doc", "user-2"), null);
});

test("assistant responses persist selection and location", async () => {
  const repository = createSqliteConversationRepository(db);
  await repository.create("conversation-recording", "conversation-doc", "user-1");
  await repository.recordAssistantResponse({
    conversationId: "conversation-recording",
    content: "Persisted answer.",
    location: JSON.stringify({ page: 2, version: 1 }),
    selectedText: "Important sentence.",
  });

  const messages = await repository.listMessages("conversation-recording");
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.content, "Persisted answer.");
  assert.equal(messages[0]?.selectedText, "Important sentence.");
  assert.equal(messages[0]?.location, JSON.stringify({ page: 2, version: 1 }));
});
