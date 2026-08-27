import { resolve } from "node:path";

import { createDb, getDatabasePath } from "./client";
import { migrate } from "./migrate-function";

const resolvedPath = resolve(getDatabasePath());

migrate(createDb(resolvedPath));

console.log(`Database ready at ${resolvedPath}`);
process.exit(0);
