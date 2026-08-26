import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { backupDatabase } from "../../src/server/db/backup.ts";
import { migrate } from "../../src/server/db/migrate-function.ts";
import { createSqliteDb, openOwnedSqliteDb } from "../../src/server/db/client.ts";
import { restoreDatabase } from "../../src/server/db/restore.ts";

let directory: string;
let cleanup: () => void;

before(() => {
  directory = mkdtempSync(join(tmpdir(), "book-reader-backup-"));
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => cleanup());

test("online backup preserves schema and data while source remains usable", async () => {
  const databasePath = join(directory, "source.db");
  const backupPath = join(directory, "nested", "backup.db");
  const database = createSqliteDb(databasePath);
  migrate(database);
  database.prepare(
    "INSERT INTO documents (id, user_id, title, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("doc-1", "user-1", "Paper", "pdf", Date.now(), Date.now());

  await backupDatabase(databasePath, backupPath);

  assert.ok(existsSync(backupPath));
  const restored = openOwnedSqliteDb(backupPath);
  try {
    const row = restored.prepare("SELECT title FROM documents WHERE id = ?").get("doc-1") as
      | { title: string }
      | undefined;
    assert.equal(row?.title, "Paper");
  } finally {
    restored.close();
  }

  database.prepare("INSERT INTO documents (id, user_id, title, format, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("doc-2", "user-1", "Still writable", "epub", Date.now(), Date.now());
  database.close();
});

test("backup rejects writing over the live database path", async () => {
  const databasePath = join(directory, "same.db");
  await assert.rejects(
    backupDatabase(databasePath, databasePath),
    /must differ/,
  );
});

test("restore validates a complete backup before replacing the live path", async () => {
  const databasePath = join(directory, "restore-target.db");
  const backupPath = join(directory, "nested", "backup.db");

  await assert.rejects(
    restoreDatabase(databasePath, join(directory, "invalid.db")),
    /ENOENT/,
  );

  await restoreDatabase(databasePath, backupPath);
  const target = createSqliteDb(databasePath);
  try {
    const row = target.prepare("SELECT title FROM documents WHERE id = ?").get("doc-1") as
      | { title: string }
      | undefined;
    assert.equal(row?.title, "Paper");
  } finally {
    target.close();
  }
});
