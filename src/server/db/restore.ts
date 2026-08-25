import { copyFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { createSqliteDb } from "./client";

export async function restoreDatabase(databasePath: string, backupPath: string): Promise<void> {
  const resolvedDatabasePath = resolve(databasePath);
  const resolvedBackupPath = resolve(backupPath);
  if (resolvedDatabasePath === resolvedBackupPath) {
    throw new Error("Restore source must differ from the database path.");
  }

  await stat(resolvedBackupPath);
  const backup = createSqliteDb(resolvedBackupPath);
  try {
    const result = backup.pragma("integrity_check") as readonly { integrity_check?: string }[];
    if (result[0]?.integrity_check !== "ok") {
      throw new Error("Backup integrity check failed.");
    }
    const tables = backup.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'",
    ).get() as { count?: number } | undefined;
    if (!tables?.count) {
      throw new Error("Backup does not contain an application database.");
    }
  } finally {
    backup.close();
  }

  await copyFile(resolvedBackupPath, resolvedDatabasePath);
}
