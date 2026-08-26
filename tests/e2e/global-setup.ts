import { rmSync } from "node:fs";

import { E2E_DATABASE_PATH, E2E_STORAGE_DIR } from "./environment";

/**
 * A run must start from an empty database and empty document storage.
 * Leftovers from an earlier run can make an assertion pass for the wrong
 * reason — the library is only "not empty" because yesterday's import is
 * still there.
 */
export default function globalSetup() {
  for (const path of [
    E2E_DATABASE_PATH,
    `${E2E_DATABASE_PATH}-wal`,
    `${E2E_DATABASE_PATH}-shm`,
  ]) {
    rmSync(path, { force: true });
  }
  rmSync(E2E_STORAGE_DIR, { force: true, recursive: true });
}
