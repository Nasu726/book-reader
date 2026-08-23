import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMParser } from "linkedom";

import {
  DOCUMENT_SELECTION_VERSION,
  captureEpubSelection,
  normalizePdfSelectionText,
  normalizeSelectionText,
  parseSelectionLocation,
} from "../../src/core/selection/capture.ts";

function createEpubSelection(text: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<article data-reader-section="chapter-1"><p>${text}</p></article>`,
    "text/html",
  ) as unknown as Document & {
    createRange(): Range;
    getSelection(): Selection;
  };
  const paragraph = document.querySelector("p")!;
  const paragraphText = paragraph.firstChild!;
  const selection = {
    anchorNode: paragraphText,
    getRangeAt: () => ({
      endContainer: paragraphText,
      endOffset: paragraphText.textContent?.length ?? 0,
      startContainer: paragraphText,
      startOffset: 0,
    }),
    rangeCount: 1,
    toString: () => paragraph.textContent,
  } as unknown as Selection;
  return { document, selection };
}

test("selection locations reject malformed payloads", () => {
  assert.equal(parseSelectionLocation("not-json"), null);
  assert.equal(parseSelectionLocation("{}"), null);
});

test("EPUB selection captures a section-scoped stable intent", () => {
  const { document, selection } = createEpubSelection("Stable sentence.");
  const captured = captureEpubSelection(selection, document);
  assert.ok(captured);
  assert.equal(captured.format, "epub");
  assert.equal(captured.text, "Stable sentence.");
  const location = JSON.parse(captured.location);
  assert.equal(location.sectionId, "chapter-1");
  assert.equal(location.version, DOCUMENT_SELECTION_VERSION);
    assert.equal(
      document.documentElement.textContent!.slice(location.startOffset, location.endOffset),
      "Stable sentence.",
    );
});

test("selection locations accept captured envelopes", () => {
  const { document, selection } = createEpubSelection("Stable sentence.");
  const captured = captureEpubSelection(selection, document);
  assert.ok(captured);
  assert.deepEqual(parseSelectionLocation(JSON.stringify(captured)), {
    format: "epub",
    location: captured.location,
    text: "Stable sentence.",
    version: 1,
  });
});

test("PDF selection text joins visual line breaks", () => {
  assert.equal(
    normalizePdfSelectionText("inter-\nnational\nsentence."),
    "international sentence.",
  );
});

test("PDF selection preserves paragraph boundaries and punctuation", () => {
  assert.equal(
    normalizePdfSelectionText("First sentence.\n\nSecond\nline?"),
    "First sentence. Second line?",
  );
});

test("PDF selection trims whitespace-only candidates", () => {
  assert.equal(normalizePdfSelectionText(" \n \n"), "");
});

test("EPUB selection intent normalizes reflowed whitespace", () => {
  assert.equal(normalizeSelectionText("First\n  line.\tSecond"), "First line. Second");
});
