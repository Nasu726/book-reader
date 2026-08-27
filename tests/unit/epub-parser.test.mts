import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before } from "node:test";

import { test } from "node:test";

import { parseHTML } from "linkedom";
import JSZip from "jszip";

import { EpubParser } from "../../src/core/documents/epub-parser.ts";
import { Book } from "@likecoin/epub-ts/node";

import { DocumentParseError } from "../../src/core/documents/parser.ts";

class LinkedomTextParser {
  parseFromString(markup: string) {
    return parseHTML(markup).document;
  }
}

test("malformed EPUB returns DocumentParseError", async () => {
  const ignored = (reason: unknown) => {
    if (reason instanceof Error && reason.message.includes("Corrupted zip")) {
      return;
    }
    throw reason;
  };
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", ignored);
  process.once("beforeExit", () => {
    process.off("unhandledRejection", ignored);
  });
  process.setMaxListeners(0);

  const parser = new EpubParser(LinkedomTextParser, Book as never);

  try {
    await parser.parse(new ArrayBuffer(0), "book.epub");
    assert.fail("expected DocumentParseError");
  } catch (error) {
    assert.ok(error instanceof DocumentParseError);
    assert.equal(error.filename, "book.epub");
    assert.equal(error.format, "epub");
  }
});

let cleanup: () => void;
let samplePath: string;

before(async () => {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Sample Book</dc:title><dc:creator>Author Name</dc:creator><dc:identifier id="id">sample-book</dc:identifier></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="s2" href="chapter2.xhtml" media-type="application/xhtml+xml"/><item id="s1" href="chapter1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="s1"/><itemref idref="s2"/></spine></package>`,
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Navigation</title></head><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">First</a></li><li><a href="chapter2.xhtml">Second</a></li></ol></nav></body></html>`,
  );
  zip.file(
    "OEBPS/chapter1.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Alpha text</p></body></html>`,
  );
  zip.file(
    "OEBPS/chapter2.xhtml",
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Beta text</p></body></html>`,
  );

  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const directory = mkdtempSync(join(tmpdir(), "book-reader-epub-"));
  samplePath = join(directory, "sample.epub");
  writeFileSync(samplePath, Buffer.from(buffer));
  cleanup = () => rmSync(directory, { recursive: true, force: true });
});

after(() => {
  cleanup();
});

test("valid EPUB extracts metadata and stable section order", async () => {
  const { readFileSync } = await import("node:fs");
  const data = readFileSync(samplePath);
  const source = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  );

  const result = await new EpubParser(LinkedomTextParser, Book as never).parse(
    source,
    samplePath,
  );

  assert.equal(result.format, "epub");
  assert.equal(result.title, "Sample Book");
  assert.equal(result.author, "Author Name");
  assert.deepEqual(
    result.sections.map((section) => [section.title, section.content]),
    [
      ["First", "Alpha text"],
      ["Second", "Beta text"],
    ],
  );
});

test("the parser refuses to run without a Book implementation", () => {
  // The implementation is injected so the browser and the server can share
  // this logic; forgetting it must fail loudly rather than at parse time.
  assert.throws(
    () => new EpubParser(LinkedomTextParser),
    DocumentParseError,
  );
});
