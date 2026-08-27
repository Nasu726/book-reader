import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { Readable } from "node:stream";

import type {
  DocumentStorage,
  StoredDocumentSource,
} from "@/core/documents/storage";

const FILE_PREFIX = "file:";
const DATA_PREFIX = "data:";

/** Rejects anything that could escape the storage directory. */
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

export function createFilesystemDocumentStorage(
  directory = process.env.DOCUMENT_STORAGE_DIR ?? "./data/documents",
): DocumentStorage {
  const root = isAbsolute(directory) ? directory : resolve(process.cwd(), directory);

  function pathFor(key: string): string | null {
    if (!isSafeKey(key)) return null;
    const target = join(root, key);
    return target.startsWith(root) ? target : null;
  }

  async function put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const target = pathFor(key);
    if (!target) throw new Error("Unsafe document storage key.");
    await mkdir(root, { recursive: true });
    await writeFile(target, bytes);
    return `${FILE_PREFIX}${key}:${contentType}`;
  }

  async function get(reference: string): Promise<StoredDocumentSource | null> {
    // Documents imported before the storage boundary existed are still inline.
    if (reference.startsWith(DATA_PREFIX)) return decodeDataUrl(reference);
    if (!reference.startsWith(FILE_PREFIX)) return null;

    const rest = reference.slice(FILE_PREFIX.length);
    const separator = rest.indexOf(":");
    const key = separator < 0 ? rest : rest.slice(0, separator);
    const contentType = separator < 0
      ? "application/octet-stream"
      : rest.slice(separator + 1);
    const target = pathFor(key);
    if (!target) return null;

    try {
      const stats = await stat(target);
      return {
        contentType,
        size: stats.size,
        stream: Readable.toWeb(
          createReadStream(target),
        ) as ReadableStream<Uint8Array>,
      };
    } catch {
      return null;
    }
  }

  async function remove(reference: string): Promise<void> {
    if (!reference.startsWith(FILE_PREFIX)) return;
    const rest = reference.slice(FILE_PREFIX.length);
    const key = rest.includes(":") ? rest.slice(0, rest.indexOf(":")) : rest;
    const target = pathFor(key);
    if (target) await rm(target, { force: true });
  }

  return { put, get, delete: remove };
}
