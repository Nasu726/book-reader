import assert from "node:assert/strict";
import { test } from "node:test";

import { extractPdfParagraphs, type PdfTextItem } from "../../src/core/documents/pdf-extraction.ts";

/** One line of a page, at a baseline, starting at a left edge. */
function line(text: string, baseline: number, left = 60, characterWidth = 7): PdfTextItem {
  return {
    str: text,
    transform: [characterWidth, 0, 0, characterWidth, left, baseline],
    width: text.length * characterWidth,
  };
}

test("a line that stops short of the margin ends its paragraph", () => {
  // A title page: three standing lines, then a paragraph that runs to the edge.
  const page = [
    line("The Structure of Scientific Revolutions", 740),
    line("Chapter 1: Introduction", 720),
    line("A Role for History", 700),
    line("History, if viewed as a repository for more than", 680),
    line("anecdote or chronology, could produce a decisive", 660),
    line("transformation in the image of science by which we", 640),
    line("are now possessed.", 620),
  ];

  assert.deepEqual(extractPdfParagraphs(page), [
    "The Structure of Scientific Revolutions",
    "Chapter 1: Introduction",
    "A Role for History",
    "History, if viewed as a repository for more than anecdote or chronology,"
      + " could produce a decisive transformation in the image of science by"
      + " which we are now possessed.",
  ]);
});

test("a wider step down the page is a break", () => {
  const page = [
    line("Normal science means research firmly based upon one", 700),
    line("or more past scientific achievements that a community", 680),
    // Twice the usual step: a blank line between blocks.
    line("Achievements that share these two characteristics I", 640),
    line("shall henceforth refer to as paradigms, a term that", 620),
  ];

  const paragraphs = extractPdfParagraphs(page);
  assert.equal(paragraphs.length, 2);
  assert.match(paragraphs[0], /^Normal science/);
  assert.match(paragraphs[1], /^Achievements/);
});

test("an indented line starts a paragraph", () => {
  const page = [
    line("first paragraph running the full width of the column", 700),
    line("continuing on the second line of that same paragraph", 680),
    line("indented second paragraph running the full width of", 660, 90),
    line("this one continues to the second line as well right", 640),
  ];

  const paragraphs = extractPdfParagraphs(page);
  assert.equal(paragraphs.length, 2);
  assert.match(paragraphs[1], /^indented second paragraph/);
});

test("a word split across a line break is put back together", () => {
  const page = [
    line("anecdote or chronology could produce a decisive trans-", 700),
    line("formation in the image of science by which we are now", 680),
  ];

  assert.deepEqual(extractPdfParagraphs(page), [
    "anecdote or chronology could produce a decisive transformation in the"
      + " image of science by which we are now",
  ]);
});

test("a page with nothing on it has no paragraphs", () => {
  assert.deepEqual(extractPdfParagraphs([]), []);
  assert.deepEqual(extractPdfParagraphs([line("   ", 700)]), []);
});
