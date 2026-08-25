import { backupDatabase } from "../src/server/db/backup";

const databasePath = process.env.DATABASE_PATH;
const backupPath = process.argv[2];

if (!databasePath || !backupPath) {
  console.error("Usage: DATABASE_PATH=<database> npm run db:backup -- <backup-file>");
  process.exit(1);
}

try {
  await backupDatabase(databasePath, backupPath);
  console.log(`Database backed up to ${backupPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Database backup failed.");
  process.exit(1);
}
