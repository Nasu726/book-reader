import assert from "node:assert/strict";
import { test } from "node:test";

import type { ParsedDocument } from "../../src/core/documents/parser.ts";
import {
  EpubReader,
  EPUB_LOCATION_VERSION,
} from "../../src/readers/epub-reader.ts";

const parsedDocument: ParsedDocument = {
  format: "epub",
  title: "Sample Book",
  sections: [
    { id: "s1", content: "First chapter text" },
    { id: "s2", content: "Second chapter text" },
    { id: "s3", content: "Third chapter text" },
  ],
};

test("EPUB reader opens at the first spine section by default", () => {
  const reader = new EpubReader(parsedDocument);

  assert.deepEqual(reader.open(), {
    version: EPUB_LOCATION_VERSION,
    sectionId: "s1",
  });
});

test("EPUB reader navigates between adjacent sections", () => {
  const reader = new EpubReader(parsedDocument);
  const initial = reader.encodeLocation({
    version: EPUB_LOCATION_VERSION,
    sectionId: "s2",
    characterOffset: 4,
  });

  assert.deepEqual(reader.nextSection(initial), {
    version: EPUB_LOCATION_VERSION,
    sectionId: "s3",
  });
  assert.deepEqual(reader.previousSection(initial), {
    version: EPUB_LOCATION_VERSION,
    sectionId: "s1",
  });
});

test("EPUB navigation stops at the first and last sections", () => {
  const reader = new EpubReader(parsedDocument);
  const first = reader.encodeLocation(reader.firstLocation());
  const last = reader.encodeLocation({
    version: EPUB_LOCATION_VERSION,
    sectionId: "s3",
  });

  assert.equal(reader.previousSection(first), null);
  assert.equal(reader.nextSection(last), null);
});

test("EPUB locations survive encode and reload-style restore", () => {
  const reader = new EpubReader(parsedDocument);
  const location = reader.encodeLocation({
    version: EPUB_LOCATION_VERSION,
    sectionId: "s2",
    characterOffset: 7,
  });
  const reloadedReader = new EpubReader(parsedDocument);

  assert.deepEqual(reloadedReader.restore(location), {
    version: EPUB_LOCATION_VERSION,
    sectionId: "s2",
    characterOffset: 7,
  });
});

test("font size changes preserve proportional reading intent", () => {
  const reader = new EpubReader(parsedDocument);
  const location = reader.encodeLocation({
    version: EPUB_LOCATION_VERSION,
    sectionId: "s1",
    characterOffset: 5,
  });

  assert.deepEqual(
    reader.applyFontSizeChange(location, { previousOffset: 5, ratio: 2 }),
    {
      version: EPUB_LOCATION_VERSION,
      sectionId: "s1",
      characterOffset: 10,
    },
  );
});

test("invalid or unknown EPUB locations fail safely", () => {
  const reader = new EpubReader(parsedDocument);

  for (const location of [
    "not-json",
    JSON.stringify({ version: 0, sectionId: "s1" }),
    JSON.stringify({ version: EPUB_LOCATION_VERSION, sectionId: "unknown" }),
    JSON.stringify({ version: EPUB_LOCATION_VERSION, sectionId: "s1", characterOffset: -1 }),
  ]) {
    assert.throws(() => reader.restore(location));
  }
});
