import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";
import type { Db } from "./client";
import type { Database } from "better-sqlite3";

export function createDrizzleFromSqlite(database: Database): Db {
  // Cast to the shared shape: drizzle's better-sqlite3 builders are promises
  // like D1's, and the repositories only use the awaited API. See database.ts.
  return drizzle(database, { schema }) as unknown as Db;
}
