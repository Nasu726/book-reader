import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

import { readStoredBytes } from "../../src/core/documents/storage.ts";
import { createFilesystemDocumentStorage } from "../../src/server/storage/filesystem-document-storage.ts";
import {
  createR2DocumentStorage,
  type R2BucketLike,
} from "../../src/server/storage/r2-document-storage.ts";
import {
  getDocumentStorage,
  resetDocumentStorage,
  setR2DocumentStorage,
} from "../../src/server/storage/index.ts";

/** A bucket that behaves like R2 for the operations this reader performs. */
function fakeBucket(): R2BucketLike & { objects: Map<string, { bytes: Uint8Array; contentType?: string }> } {
  const objects = new Map<string, { bytes: Uint8Array; contentType?: string }>();
  return {
    objects,
    async put(key, value, options) {
      const view = value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      objects.set(key, { bytes: new Uint8Array(view), contentType: options?.httpMetadata?.contentType });
    },
    async get(key) {
      const object = objects.get(key);
      if (!object) return null;
      return {
        body: new Response(new Uint8Array(object.bytes).slice().buffer as ArrayBuffer).body as ReadableStream<Uint8Array>,
        size: object.bytes.byteLength,
        httpMetadata: { contentType: object.contentType },
      };
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

const SAMPLE = new TextEncoder().encode("%PDF-1.4 sample bytes");

let directory: string;

before(() => {
  directory = mkdtempSync(join(tmpdir(), "book-reader-storage-"));
});

after(() => rmSync(directory, { recursive: true, force: true }));

beforeEach(() => resetDocumentStorage());

test("R2 stores, streams back, and deletes a document", async () => {
  const bucket = fakeBucket();
  const storage = createR2DocumentStorage(bucket);

  const reference = await storage.put("doc-1", SAMPLE, "application/pdf");
  assert.match(reference, /^r2:doc-1:application\/pdf$/);

  const stored = await storage.get(reference);
  assert.ok(stored);
  assert.equal(stored.contentType, "application/pdf");
  assert.equal(stored.size, SAMPLE.byteLength);
  assert.deepEqual(new Uint8Array(await readStoredBytes(stored)), SAMPLE);

  await storage.delete(reference);
  assert.equal(await storage.get(reference), null);
});

test("R2 refuses keys that could address another object", async () => {
  const storage = createR2DocumentStorage(fakeBucket());
  await assert.rejects(storage.put("../secrets", SAMPLE, "application/pdf"), /Unsafe/);
  await assert.rejects(storage.put("a/b", SAMPLE, "application/pdf"), /Unsafe/);
  assert.equal(await storage.get("r2:../secrets:application/pdf"), null);
});

test("a missing R2 object reads as absent rather than throwing", async () => {
  const storage = createR2DocumentStorage(fakeBucket());
  assert.equal(await storage.get("r2:never-written:application/pdf"), null);
  assert.equal(await storage.get("file:doc-1:application/pdf"), null);
});

test("both backends still read documents imported before the split", async () => {
  // Those rows hold a base64 data URL where a reference now goes.
  const reference = `data:application/pdf;base64,${Buffer.from(SAMPLE).toString("base64")}`;
  for (const storage of [
    createR2DocumentStorage(fakeBucket()),
    createFilesystemDocumentStorage(directory),
  ]) {
    const stored = await storage.get(reference);
    assert.ok(stored);
    assert.equal(stored.contentType, "application/pdf");
    assert.deepEqual(new Uint8Array(await readStoredBytes(stored)), SAMPLE);
  }
});

test("the filesystem backend round-trips a document", async () => {
  const storage = createFilesystemDocumentStorage(directory);
  const reference = await storage.put("doc-2", SAMPLE, "application/epub+zip");
  const stored = await storage.get(reference);
  assert.ok(stored);
  assert.deepEqual(new Uint8Array(await readStoredBytes(stored)), SAMPLE);

  await storage.delete(reference);
  assert.equal(await storage.get(reference), null);
});

test("the selector uses the filesystem until an R2 bucket is supplied", async () => {
  const filesystemReference = await (await getDocumentStorage()).put("doc-3", SAMPLE, "application/pdf");
  assert.match(filesystemReference, /^file:/);

  const bucket = fakeBucket();
  setR2DocumentStorage(bucket);
  const r2Reference = await (await getDocumentStorage()).put("doc-4", SAMPLE, "application/pdf");
  assert.match(r2Reference, /^r2:/);
  assert.ok(bucket.objects.has("doc-4"));
});
