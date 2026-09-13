import assert from "node:assert/strict";
import { test } from "node:test";

import {
  readPdfOutline,
  sectionAt,
  sectionPages,
  type OutlineEntry,
} from "../../src/core/documents/pdf-outline.ts";

/** Enough of a pdf.js document to read an outline from. */
function fakeDocument(outline: unknown[] | null, named: Record<string, unknown[]> = {}) {
  return {
    getOutline: async () => outline as never,
    getDestination: async (name: string) => (named[name] ?? null) as never,
    getPageIndex: async (ref: unknown) => {
      const page = (ref as { num?: number }).num;
      if (page === undefined) throw new Error("not a page");
      return page - 1;
    },
  };
}

test("an outline is flattened in document order with its depth", async () => {
  const pdf = fakeDocument([
    { title: "Introduction", dest: [{ num: 1 }, { name: "XYZ" }, 0, 792, null], items: [] },
    {
      title: "Methods",
      dest: [{ num: 3 }, { name: "XYZ" }, 0, 792, null],
      items: [
        { title: "Setup", dest: [{ num: 3 }, { name: "XYZ" }, 0, 400, null], items: [] },
        { title: "Data", dest: [{ num: 4 }, { name: "XYZ" }, 0, 792, null], items: [] },
      ],
    },
    { title: "  Results\n", dest: "results", items: [] },
  ], { results: [{ num: 6 }, { name: "Fit" }] });

  assert.deepEqual(await readPdfOutline(pdf), [
    { title: "Introduction", page: 1, depth: 0 },
    { title: "Methods", page: 3, depth: 0 },
    { title: "Setup", page: 3, depth: 1 },
    { title: "Data", page: 4, depth: 1 },
    { title: "Results", page: 6, depth: 0 },
  ]);
});

test("entries that lead nowhere are left out, and no outline is an empty list", async () => {
  const pdf = fakeDocument([
    { title: "Cover", dest: null, items: [] },
    { title: "Lost", dest: "missing", items: [] },
    { title: "Broken", dest: [{ gen: 0 }, { name: "XYZ" }], items: [] },
    { title: "", dest: [{ num: 2 }, { name: "XYZ" }], items: [] },
    { title: "Chapter 1", dest: [{ num: 2 }, { name: "XYZ" }], items: [] },
  ]);
  assert.deepEqual(await readPdfOutline(pdf), [{ title: "Chapter 1", page: 2, depth: 0 }]);
  assert.deepEqual(await readPdfOutline(fakeDocument(null)), []);
  assert.deepEqual(await readPdfOutline({
    ...fakeDocument(null),
    getOutline: async () => { throw new Error("no catalog"); },
  }), []);
});

const outline: OutlineEntry[] = [
  { title: "Introduction", page: 1, depth: 0 },
  { title: "Methods", page: 3, depth: 0 },
  { title: "Setup", page: 3, depth: 1 },
  { title: "Data", page: 4, depth: 1 },
  { title: "Results", page: 6, depth: 0 },
];

test("the section a page falls under is the last entry that starts at or before it", () => {
  assert.equal(sectionAt(outline, 1)?.title, "Introduction");
  assert.equal(sectionAt(outline, 2)?.title, "Introduction");
  assert.equal(sectionAt(outline, 3)?.title, "Setup");
  assert.equal(sectionAt(outline, 5)?.title, "Data");
  assert.equal(sectionAt(outline, 9)?.title, "Results");
  assert.equal(sectionAt([{ title: "Late", page: 4, depth: 0 }], 2), null);
  assert.equal(sectionAt([], 2), null);
});

test("a section runs until the next entry begins, or the document ends", () => {
  assert.deepEqual(sectionPages(outline, outline[0]!, 8), [1, 2]);
  assert.deepEqual(sectionPages(outline, outline[2]!, 8), [3, 3]);
  assert.deepEqual(sectionPages(outline, outline[3]!, 8), [4, 5]);
  assert.deepEqual(sectionPages(outline, outline[4]!, 8), [6, 8]);
});
