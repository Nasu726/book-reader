import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";
import type { Db } from "./client";
import type { Database } from "better-sqlite3";

export function createDrizzleFromSqlite(database: Database): Db {
  return drizzle(database, { schema });
}
