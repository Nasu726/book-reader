import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { documents } from "../../src/server/db/schema";

import { createSqliteConversationRepository } from "../../src/repositories/sqlite/conversation-repository.ts";
import type { MessageRecord } from "../../src/repositories/types.ts";
import { createDb } from "../../src/server/db/client.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";

const baseTime = new Date("2026-08-22T00:00:00.000Z");

let cleanup: () => void;
let repository: ReturnType<typeof createSqliteConversationRepository>;
let db: ReturnType<typeof createDb>;

before(() => {
  const directory = mkdtempSync(join(tmpdir(), "book-reader-conversations-"));
  const databasePath = join(directory, "test.db");
  db = createDb(databasePath);
  migrate(db);
  repository = createSqliteConversationRepository(db);
  assert.ok(existsSync(databasePath));
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("conversation history preserves selection and location", async () => {
  const document = {
    id: "doc-1",
    userId: "user-1",
    title: "Paper",
    format: "epub" as const,
    createdAt: baseTime,
    updatedAt: baseTime,
  };
  await db.insert(documents).values(document);
  await repository.create("conversation-1", document.id, document.userId);

  const message: MessageRecord = {
    id: "message-1",
    conversationId: "conversation-1",
    role: "user",
    content: "Why is this important?",
    selectedText: "important sentence",
    location: "spine:0:cfi:/6/2",
    createdAt: baseTime,
  };

  await repository.addMessage(message);
  assert.deepEqual(await repository.listMessages("conversation-1"), [message]);
});

test("failed assistant responses leave recoverable pending state", async () => {
  await repository.create("conversation-2", "doc-1", "user-1");
  const createdAt = new Date();
  const storedCreatedAt = new Date(Math.floor(createdAt.getTime() / 1000) * 1000);
  await repository.beginPendingAssistantMessage({
    id: "assistant-pending",
    conversationId: "conversation-2",
    role: "assistant",
    content: "",
    createdAt: storedCreatedAt,
  });

  assert.deepEqual(await repository.listMessages("conversation-2"), [
    {
      id: "assistant-pending",
      conversationId: "conversation-2",
      role: "assistant",
      content: "",
      selectedText: undefined,
      location: undefined,
      createdAt: storedCreatedAt,
    },
  ]);

  await repository.completePendingAssistantMessage(
    "assistant-pending",
    "Recovered answer.",
    { selectedText: "important sentence", location: "spine:0" },
  );

  assert.ok(true);
  assert.equal((await repository.listMessages("conversation-2"))[0]?.content, "Recovered answer.");
});
