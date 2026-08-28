import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMParser } from "linkedom";

import {
  DOCUMENT_SELECTION_VERSION,
  getSectionTextOffset,
  captureEpubSelection,
  capturePdfSelection,
  normalizePdfSelectionText,
  normalizeSelectionText,
  parseSelectionLocation,
} from "../../src/core/selection/capture.ts";
import type { PaperStructure } from "../../src/core/documents/paper-structure.ts";

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

function createPdfSelection(text: string) {
  return {
    getRangeAt: () => null,
    rangeCount: 1,
    toString: () => text,
  } as unknown as Selection;
}

const paperStructure: PaperStructure = {
  abstract: "Core research summary.",
  sections: [
    { content: "Unrelated introduction text.", title: "Introduction" },
    { content: "The selected sentence appears here.", title: "Results" },
  ],
  title: "Paper title",
};

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

test("EPUB selection captures AI context without storing it in location", () => {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<article data-reader-section="chapter-1"><p>Before context. Selected sentence. After context.</p></article>`,
    "text/html",
  ) as unknown as Document & { createRange(): Range };
  const paragraphText = document.querySelector("p")!.firstChild!;
  const selection = {
    anchorNode: paragraphText,
    getRangeAt: () => ({
      endContainer: paragraphText,
      endOffset: "Before context. Selected sentence.".length,
      startContainer: paragraphText,
      startOffset: "Before context. ".length,
    }),
    rangeCount: 1,
    toString: () => "Selected sentence.",
  } as unknown as Selection;
  const captured = captureEpubSelection(selection, document, "Paper title");

  assert.ok(captured);
  assert.equal(captured.documentTitle, "Paper title");
  assert.equal(captured.surroundingText?.before, "Before context.");
  assert.equal(captured.surroundingText?.after, "After context.");
  const location = JSON.parse(captured.location);
  assert.equal("documentTitle" in location, false);
  assert.equal("surroundingText" in location, false);
});

test("PDF selection derives AI context from page text", () => {
  const captured = capturePdfSelection(createPdfSelection("middle"), 2, {
    documentTitle: "Paper title",
    pageText: "Before context. middle After context.",
  });

  assert.ok(captured);
  assert.equal(captured.format, "pdf");
  assert.equal(captured.documentTitle, "Paper title");
  assert.equal(captured.surroundingText?.before, "Before context.");
  assert.equal(captured.surroundingText?.after, "After context.");
});

test("PDF selection carries inferred paper structure outside persisted location", () => {
  const captured = capturePdfSelection(createPdfSelection("middle"), 4, {
    documentTitle: "Paper title",
    pageText: "Before context. middle After context.",
    paperStructure,
  });

  assert.ok(captured);
  assert.equal(captured.paperStructure?.title, "Paper title");
  const location = JSON.parse(captured.location);
  assert.equal("paperStructure" in location, false);
});

test("PDF selection context falls back safely without page text", () => {
  const captured = capturePdfSelection(createPdfSelection("middle"), 3);

  assert.ok(captured);
  assert.equal(captured.surroundingText, undefined);
});

test("a selection that starts or ends on an element is still captured", () => {
  // What Chrome hands over for a triple-click, or a drag that runs past the end
  // of a paragraph: the boundary is an element and a child index, not a text
  // node. This used to come back as -1 and the selection was thrown away.
  const parser = new DOMParser();
  const document = parser.parseFromString(
    '<article data-reader-section="chapter-1"><p>Normal science</p><p>means research.</p></article>',
    "text/html",
  ) as unknown as Document;
  const article = document.querySelector("article")! as unknown as HTMLElement;
  const paragraphs = document.querySelectorAll("p");

  // The whole first paragraph: from before its first child to after its last.
  assert.equal(getSectionTextOffset(article, paragraphs[0], 0, document), 0);
  assert.equal(getSectionTextOffset(article, paragraphs[0], 1, document), "Normal science".length);
  // A boundary on the article itself, before the second paragraph.
  assert.equal(getSectionTextOffset(article, article, 1, document), "Normal science".length);
  // Still -1 for a node that is not in this section at all.
  const stranger = document.createElement("p");
  assert.equal(getSectionTextOffset(article, stranger, 0, document), -1);
});
