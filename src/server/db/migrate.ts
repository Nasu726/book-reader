import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createDb } from "./client";
import { migrate } from "./migrate-function";

const dbPath = process.env.DATABASE_PATH ?? "./data/book-reader.db";
const resolvedPath = resolve(dbPath);

mkdirSync(dirname(resolvedPath), { recursive: true });

const db = createDb(resolvedPath);
migrate(db);

console.log(`Database ready at ${resolvedPath}`);
process.exit(0);
