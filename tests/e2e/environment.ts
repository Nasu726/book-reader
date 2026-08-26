import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_DATABASE_PATH = join(tmpdir(), "book-reader-e2e", "e2e.db");
export const E2E_STORAGE_DIR = join(tmpdir(), "book-reader-e2e", "documents");

export const E2E_USERNAME = "e2e-reader";
export const E2E_PASSWORD = "e2e-reader-password";
export const E2E_PASSWORD_HASH =
  "scrypt:56049e4b19b83a241687775cbc0e3056:70cf96fa32a1cfd97310216fdc7b88d9097274bff772f0e81380d07572392a4a30e3b2567f39713cc0ff84e9d5b16415ee4ec097d7f1a96e47c7de57981d0205";
