import { rmSync } from "node:fs";

import { E2E_RUN_ROOT } from "./environment";

/** Removes this run's database and document store. */
export default function globalTeardown() {
  rmSync(E2E_RUN_ROOT, { force: true, recursive: true });
}
