import assert from "node:assert/strict";
import { test } from "node:test";

import { DocumentParserRegistry } from "../../src/core/documents/parser-registry.ts";
import {
  DocumentParseError,
  type DocumentParser,
  type ParsedDocument,
} from "../../src/core/documents/parser.ts";

const parsedDocument = (id: string): ParsedDocument => ({
  format: "epub",
  sections: [{ id, content: "Chapter text", location: `${id}:1` }],
});

const epubParser = (behavior: "success" | "failure"): DocumentParser => ({
  supports: (format) => format === "epub",
  parse: async () => {
    if (behavior === "failure") {
      throw new Error("malformed archive");
    }
    return parsedDocument("section-1");
  },
});

test("registry selects a parser by filename extension", async () => {
  const registry = new DocumentParserRegistry();
  registry.register(epubParser("success"));

  assert.deepEqual(await registry.parse(new ArrayBuffer(0), "book.epub"), {
    format: "epub",
    sections: [{ id: "section-1", content: "Chapter text", location: "section-1:1" }],
  });
});

test("registry isolates parser failures as DocumentParseError", async () => {
  const registry = new DocumentParserRegistry();
  registry.register(epubParser("failure"));

  try {
    await registry.parse(new ArrayBuffer(0), "book.epub");
    assert.fail("expected DocumentParseError");
  } catch (error) {
    assert.ok(error instanceof DocumentParseError);
    assert.equal(error.filename, "book.epub");
    assert.equal(error.format, "epub");
    assert.equal((error.cause as Error | undefined)?.message, "malformed archive");
  }
});

test("unsupported and missing formats fail safely", async () => {
  const emptyRegistry = new DocumentParserRegistry();
  const populatedRegistry = new DocumentParserRegistry();
  populatedRegistry.register(epubParser("success"));

  for (const [registry, filename] of [
    [emptyRegistry, "book.pdf"],
    [populatedRegistry, "document.txt"],
  ] as const) {
    try {
      await registry.parse(new ArrayBuffer(0), filename);
      assert.fail("expected DocumentParseError");
    } catch (error) {
      assert.ok(error instanceof DocumentParseError);
    }
  }
});
