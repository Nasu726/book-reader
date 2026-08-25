import { rm } from "node:fs/promises";

import { restoreDatabase } from "../src/server/db/restore";

const databasePath = process.env.DATABASE_PATH;
const backupPath = process.argv[2];

if (!databasePath || !backupPath || process.argv[3] !== "--replace") {
  console.error("Usage: DATABASE_PATH=<database> npm run db:restore -- <backup-file> --replace");
  process.exit(1);
}

try {
  await restoreDatabase(databasePath, backupPath);
  await Promise.all([
    rm(`${databasePath}-wal`, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
  ]);
  console.log(`Database restored from ${backupPath}. Run npm run db:migrate before starting the app.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database restore failed.");
  process.exit(1);
}
