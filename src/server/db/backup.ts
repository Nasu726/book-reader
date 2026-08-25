import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createSqliteDb } from "./client";

export async function backupDatabase(databasePath: string, backupPath: string): Promise<void> {
  const resolvedDatabasePath = resolve(databasePath);
  const resolvedBackupPath = resolve(backupPath);
  if (resolvedDatabasePath === resolvedBackupPath) {
    throw new Error("Backup path must differ from the database path.");
  }

  await mkdir(dirname(resolvedBackupPath), { recursive: true });
  const database = createSqliteDb(resolvedDatabasePath);
  try {
    await database.backup(resolvedBackupPath);
  } finally {
    database.close();
  }
}
