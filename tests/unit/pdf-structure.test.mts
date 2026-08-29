import assert from "node:assert/strict";
import { test } from "node:test";

import {
  paragraphsFromStructure,
  type MarkedTextItem,
  type StructTreeNode,
} from "../../src/core/documents/pdf-structure.ts";

/** The markers pdf.js interleaves when marked content is included. */
function open(id: string): MarkedTextItem {
  return { id, type: "beginMarkedContentProps" };
}
const close: MarkedTextItem = { type: "endMarkedContent" };
function line(str: string, hasEOL = true): MarkedTextItem {
  return { hasEOL, str };
}

test("a paragraph is what the document says it is, not what the lines look like", () => {
  const tree: StructTreeNode = {
    role: "Document",
    children: [
      { role: "H1", children: [{ type: "content", id: "mc0" }] },
      { role: "P", children: [{ type: "content", id: "mc1" }] },
      { role: "P", children: [{ type: "content", id: "mc2" }] },
    ],
  };
  const items: MarkedTextItem[] = [
    open("mc0"), line("A Role for History"), close,
    // One paragraph, set as three lines. The line breaks are the typesetter's.
    open("mc1"),
    line("History, if viewed as a repository for more than"),
    line("anecdote or chronology, could produce a decisive"),
    line("transformation in the image of science.", false),
    close,
    open("mc2"), line("Normal science means research firmly based.", false), close,
  ];

  assert.deepEqual(paragraphsFromStructure(tree, items), [
    "A Role for History",
    "History, if viewed as a repository for more than anecdote or chronology,"
      + " could produce a decisive transformation in the image of science.",
    "Normal science means research firmly based.",
  ]);
});

test("a word split across a line break is put back together", () => {
  const tree: StructTreeNode = {
    role: "Document",
    children: [{ role: "P", children: [{ type: "content", id: "mc0" }] }],
  };
  const items: MarkedTextItem[] = [
    open("mc0"),
    line("could produce a decisive trans-"),
    line("formation in the image of science.", false),
    close,
  ];

  assert.deepEqual(paragraphsFromStructure(tree, items), [
    "could produce a decisive transformation in the image of science.",
  ]);
});

test("containers hand their text to the blocks inside them", () => {
  // Sect and Document hold no prose of their own; a list item's label and body
  // are separate blocks, or a list collapses into one run.
  const tree: StructTreeNode = {
    role: "Document",
    children: [{
      role: "Sect",
      children: [
        { role: "P", children: [{ type: "content", id: "a" }] },
        {
          role: "L",
          children: [{
            role: "LI",
            children: [
              { role: "Lbl", children: [{ type: "content", id: "b" }] },
              { role: "LBody", children: [{ type: "content", id: "c" }] },
            ],
          }],
        },
      ],
    }],
  };
  const items: MarkedTextItem[] = [
    open("a"), line("Introduction.", false), close,
    open("b"), line("1.", false), close,
    open("c"), line("The first point.", false), close,
  ];

  assert.deepEqual(paragraphsFromStructure(tree, items), [
    "Introduction.",
    "1.",
    "The first point.",
  ]);
});

test("an untagged page says so rather than guessing", () => {
  // Most PDFs are untagged. The caller falls back to reading the layout.
  assert.equal(paragraphsFromStructure(null, [line("text")]), null);
  assert.equal(paragraphsFromStructure({}, [line("text")]), null);
  assert.equal(
    paragraphsFromStructure({ role: "Document", children: [] }, [line("text")]),
    null,
  );
  // Tagged, but nothing of it reaches any text.
  assert.equal(
    paragraphsFromStructure(
      { role: "Document", children: [{ role: "P", children: [{ type: "content", id: "x" }] }] },
      [open("other"), line("stray"), close],
    ),
    null,
  );
});
