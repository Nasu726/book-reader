import type {
  DocumentStorage,
  StoredDocumentSource,
} from "@/core/documents/storage";

/**
 * The part of an R2 bucket binding this reader uses.
 *
 * Declared structurally rather than imported from Cloudflare's types so the
 * adapter — and its tests — do not depend on the Workers runtime.
 */
export type R2BucketLike = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array> | null;
    size: number;
    httpMetadata?: { contentType?: string };
  } | null>;
  delete(key: string): Promise<void>;
};

const R2_PREFIX = "r2:";
const DATA_PREFIX = "data:";

/** Rejects anything that could address an object outside this reader's keys. */
function isSafeKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(key);
}

function decodeDataUrl(reference: string): StoredDocumentSource | null {
  const separator = reference.indexOf(",");
  if (separator < 0) return null;
  const header = reference.slice(DATA_PREFIX.length, separator);
  if (!header.endsWith(";base64")) return null;
  const bytes = Buffer.from(reference.slice(separator + 1), "base64");
  return {
    contentType: header.slice(0, -";base64".length) || "application/octet-stream",
    size: bytes.byteLength,
    stream: new Response(bytes).body as ReadableStream<Uint8Array>,
  };
}

/**
 * Documents in Cloudflare R2.
 *
 * R2 is where the bytes belong on Workers: a Worker has no filesystem, and D1
 * is a database rather than a blob store. Egress from R2 is free, which is what
 * makes serving whole books from the free plan reasonable.
 */
export function createR2DocumentStorage(bucket: R2BucketLike): DocumentStorage {
  async function put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    if (!isSafeKey(key)) throw new Error("Unsafe document storage key.");
    await bucket.put(key, bytes, { httpMetadata: { contentType } });
    return `${R2_PREFIX}${key}:${contentType}`;
  }

  async function get(reference: string): Promise<StoredDocumentSource | null> {
    // Documents imported before the storage boundary existed are still inline.
    if (reference.startsWith(DATA_PREFIX)) return decodeDataUrl(reference);
    if (!reference.startsWith(R2_PREFIX)) return null;

    const rest = reference.slice(R2_PREFIX.length);
    const separator = rest.indexOf(":");
    const key = separator < 0 ? rest : rest.slice(0, separator);
    const declaredContentType = separator < 0 ? "" : rest.slice(separator + 1);
    if (!isSafeKey(key)) return null;

    const object = await bucket.get(key);
    if (!object?.body) return null;
    return {
      contentType: object.httpMetadata?.contentType
        || declaredContentType
        || "application/octet-stream",
      size: object.size,
      stream: object.body,
    };
  }

  async function remove(reference: string): Promise<void> {
    if (!reference.startsWith(R2_PREFIX)) return;
    const rest = reference.slice(R2_PREFIX.length);
    const key = rest.includes(":") ? rest.slice(0, rest.indexOf(":")) : rest;
    if (isSafeKey(key)) await bucket.delete(key);
  }

  return { put, get, delete: remove };
}
