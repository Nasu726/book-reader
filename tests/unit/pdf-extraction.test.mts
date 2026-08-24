import assert from "node:assert/strict";
import { test } from "node:test";

import { extractPdfText, type PdfTextItem } from "../../src/core/documents/pdf-extraction.ts";

function item(str: string, left: number, baseline: number): PdfTextItem {
  return {
    str,
    transform: [10, 0, 0, 10, left, baseline],
    width: str.length * 5,
  };
}

test("PDF extraction joins single-column lines deterministically", () => {
  const text = extractPdfText([
    item("First", 50, 700),
    item("sentence.", 90, 700),
    item("Second", 50, 680),
    item("sentence.", 90, 680),
    { str: "", transform: [10, 0, 0, 10, 100, 700] },
  ]);

  assert.equal(text, "First sentence.\nSecond sentence.");
});

test("PDF extraction orders two-column content column by column", () => {
  const text = extractPdfText([
    item("Right top", 320, 700),
    item("Left top", 50, 700),
    item("Right bottom", 320, 650),
    item("Left bottom", 50, 650),
  ]);

  assert.equal(text, "Left top\nLeft bottom\nRight top\nRight bottom");
});

test("PDF extraction returns empty output when coordinates are unavailable", () => {
  assert.equal(extractPdfText([{ str: "Broken" }]), "");
});
