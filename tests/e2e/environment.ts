import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Every run gets its own database and document store.
 *
 * Deleting a fixed path instead would race the web server, which Playwright
 * starts before global setup runs: the server can already have opened — and
 * cached — a connection to the file that setup then unlinks.
 *
 * The id is stamped into the environment by whichever process evaluates this
 * first, so the config, the workers, and the web server all agree on it.
 */
process.env.E2E_RUN_ID ??= `${Date.now()}-${process.pid}`;

const runRoot = join(tmpdir(), "book-reader-e2e", process.env.E2E_RUN_ID);

export const E2E_RUN_ROOT = runRoot;
export const E2E_DATABASE_PATH = join(runRoot, "e2e.db");
export const E2E_STORAGE_DIR = join(runRoot, "documents");

export const E2E_USERNAME = "e2e-reader";
export const E2E_PASSWORD = "e2e-reader-password";
export const E2E_PASSWORD_HASH =
  "scrypt:56049e4b19b83a241687775cbc0e3056:70cf96fa32a1cfd97310216fdc7b88d9097274bff772f0e81380d07572392a4a30e3b2567f39713cc0ff84e9d5b16415ee4ec097d7f1a96e47c7de57981d0205";
