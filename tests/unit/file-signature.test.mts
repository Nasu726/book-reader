import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";

import { detectFormatFromBytes } from "../../src/core/documents/file-signature.ts";

test("a PDF is recognized from its header", () => {
  assert.equal(detectFormatFromBytes(Buffer.from("%PDF-1.7\n...")), "pdf");
});

test("an EPUB is recognized from its zip header and mimetype entry", async () => {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", "<container/>");
  const bytes = new Uint8Array(await zip.generateAsync({ type: "arraybuffer" }));
  assert.equal(detectFormatFromBytes(bytes), "epub");
});

test("a plain zip is not accepted as an EPUB", async () => {
  const zip = new JSZip();
  zip.file("notes.txt", "not a book");
  const bytes = new Uint8Array(await zip.generateAsync({ type: "arraybuffer" }));
  assert.equal(detectFormatFromBytes(bytes), null);
});

test("an executable renamed to .pdf is rejected", () => {
  assert.equal(detectFormatFromBytes(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02])), null);
});

test("empty input is rejected rather than throwing", () => {
  assert.equal(detectFormatFromBytes(new Uint8Array()), null);
});
