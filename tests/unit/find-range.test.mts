import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMParser } from "linkedom";

import { findRangeByOffsets, findRangeByText } from "../../src/core/selection/find-range.ts";
import { getSectionTextOffset, normalizePdfSelectionText } from "../../src/core/selection/capture.ts";

function parse(html: string): { document: Document; container: Element } {
  const document = new DOMParser().parseFromString(html, "text/html") as unknown as Document;
  return { document, container: document.querySelector("[data-container]")! };
}

/** The text a found range actually covers, assembled the way a Range would. */
function textOf(container: Node, found: ReturnType<typeof findRangeByText>): string {
  assert.ok(found, "expected a range");
  const nodes: Text[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) nodes.push(node as Text);
    else for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  };
  visit(container);

  const startIndex = nodes.indexOf(found.start.node as Text);
  const endIndex = nodes.indexOf(found.end.node as Text);
  if (startIndex === endIndex) {
    return nodes[startIndex].data.slice(found.start.offset, found.end.offset);
  }
  let text = nodes[startIndex].data.slice(found.start.offset);
  for (let index = startIndex + 1; index < endIndex; index += 1) text += nodes[index].data;
  return text + nodes[endIndex].data.slice(0, found.end.offset);
}

test("EPUB offsets place a highlight on the occurrence it was taken from", () => {
  const { container } = parse(
    '<article data-container><p>A paradigm is a paradigm.</p></article>',
  );
  // The second "paradigm", which a text search could not tell from the first.
  const sentence = "A paradigm is a paradigm.";
  const start = sentence.lastIndexOf("paradigm");
  const found = findRangeByOffsets(container, start, start + "paradigm".length);

  assert.equal(textOf(container, found), "paradigm");
  assert.equal(found!.start.offset, start);
});

test("EPUB offsets span element boundaries", () => {
  const { container } = parse(
    '<article data-container><p>Normal <em>science</em> means research.</p></article>',
  );
  const found = findRangeByOffsets(container, "Normal ".length, "Normal science means".length);
  assert.equal(textOf(container, found), "science means");
});

test("EPUB offsets that describe nothing are refused", () => {
  const { container } = parse('<article data-container><p>Short.</p></article>');
  assert.equal(findRangeByOffsets(container, 3, 3), null);
  assert.equal(findRangeByOffsets(container, -1, 4), null);
  assert.equal(findRangeByOffsets(container, 0, 999), null);
  assert.equal(findRangeByOffsets(container, 1.5, 4), null);
});

test("an EPUB offset agrees with the one capture recorded", () => {
  const { document, container } = parse(
    '<article data-container data-reader-section="ch1"><p>Normal <em>science</em> means research.</p></article>',
  );
  const emphasis = document.querySelector("em")!.firstChild!;
  const captured = getSectionTextOffset(container as HTMLElement, emphasis, 0, document);
  const found = findRangeByOffsets(container, captured, captured + "science".length);
  assert.equal(textOf(container, found), "science");
});

test("PDF text is found across the line breaks a text layer keeps", () => {
  // One span per line, the way pdf.js builds a text layer.
  const { container } = parse(
    "<div data-container><span>could produce a decisive</span>\n"
    + "<span>transformation in the image</span></div>",
  );
  const selected = normalizePdfSelectionText("a decisive\ntransformation");
  assert.equal(textOf(container, findRangeByText(container, selected)), "a decisive\ntransformation");
});

test("PDF text is found when a word was split by a hyphen at a line end", () => {
  const { container } = parse(
    "<div data-container><span>could produce a decisive trans-</span>\n"
    + "<span>formation in the image</span></div>",
  );
  // What capture stores for that selection: the hyphen and break resolved.
  const selected = normalizePdfSelectionText("decisive trans-\nformation in");
  assert.equal(selected, "decisive transformation in");
  assert.equal(
    textOf(container, findRangeByText(container, selected)),
    "decisive trans-\nformation in",
  );
});

test("PDF text that is not on the page yields nothing rather than a wrong range", () => {
  const { container } = parse("<div data-container><span>Normal science.</span></div>");
  assert.equal(findRangeByText(container, "revolutionary science"), null);
  assert.equal(findRangeByText(container, "   "), null);
  assert.equal(findRangeByText(container, ""), null);
});
