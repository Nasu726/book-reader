import { isCloudflareWorker } from "@/server/runtime";
import type { DocumentStorage } from "@/core/documents/storage";

import { createFilesystemDocumentStorage } from "./filesystem-document-storage";
import { createR2DocumentStorage, type R2BucketLike } from "./r2-document-storage";

/**
 * Chooses where imported documents live.
 *
 * R2 on Cloudflare, the local filesystem everywhere else. Callers only ever see
 * the DocumentStorage interface, so nothing above this file knows which one is
 * in use — that is the whole point of the boundary.
 */
let injectedBucket: R2BucketLike | null = null;
let shared: DocumentStorage | undefined;

/**
 * Supplies the R2 bucket binding.
 *
 * A Worker receives its bindings per request rather than through the
 * environment, so the Cloudflare entry point hands the binding in here instead
 * of this module reaching for it.
 */
export function setR2DocumentStorage(bucket: R2BucketLike): void {
  if (injectedBucket === bucket) return;
  injectedBucket = bucket;
  shared = undefined;
}

export async function getDocumentStorage(): Promise<DocumentStorage> {
  if (shared) return shared;

  const bucket = injectedBucket ?? await readCloudflareBucket();
  shared = bucket
    ? createR2DocumentStorage(bucket)
    : createFilesystemDocumentStorage();
  return shared;
}

/**
 * The R2 binding, when this is running on Cloudflare.
 *
 * A Worker receives bindings per request rather than through the environment.
 * Absent everywhere else, which is how the filesystem store gets chosen.
 */
async function readCloudflareBucket(): Promise<R2BucketLike | null> {
  if (!isCloudflareWorker()) return null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = (await getCloudflareContext({ async: true })).env as
      Record<string, unknown>;
    const bucket = env.DOCUMENTS;
    return bucket ? (bucket as R2BucketLike) : null;
  } catch {
    return null;
  }
}

/** Exposed for tests, which need each case to start from a clean selection. */
export function resetDocumentStorage(): void {
  injectedBucket = null;
  shared = undefined;
}

export type { R2BucketLike };
