import assert from "node:assert/strict";
import { test } from "node:test";

import { parseNote, renderNote, type NoteState } from "../../src/notes/format.ts";

const state: NoteState = {
  frontmatter: {
    title: "Attention Is All You Need",
    authors: ["Vaswani", "Shazeer"],
    source: "https://arxiv.org/abs/1706.03762",
    added: "2026-09-13",
    status: "reading",
    tags: ["paper"],
  },
  highlights: [
    {
      id: "8f2a1c",
      color: "yellow",
      selectedText: "Multi-head attention allows the model to jointly attend to information from different representation subspaces.",
      location: JSON.stringify({ page: 3, source: "text-layer-viewport", version: 1 }),
      note: "The key idea.\nWorth a second read.",
      where: "p.3",
    },
    {
      id: "b77e02",
      color: "green",
      selectedText: "Alpha journey text.",
      location: JSON.stringify({ endOffset: 19, sectionId: "ch1", startOffset: 0, text: "Alpha journey text.", version: 1 }),
      where: "§1. The Analytical Engine",
    },
  ],
  memo: "Read for the seminar.\n\nCompare with the RNN baseline.",
};

test("a note renders to the documented shape", () => {
  const markdown = renderNote(state, { before: "", after: "\n" });
  assert.equal(markdown, `---
title: Attention Is All You Need
authors: [Vaswani, Shazeer]
source: https://arxiv.org/abs/1706.03762
added: 2026-09-13
status: reading
tags: [paper]
---
<!-- book-reader:start -->
> [!quote] p.3 · yellow
> Multi-head attention allows the model to jointly attend to information from different representation subspaces.
>
> The key idea.
> Worth a second read.
<!-- h: 8f2a1c pdf:3 -->

> [!quote] §1. The Analytical Engine · green
> Alpha journey text.
<!-- h: b77e02 epub:ch1:0-19 -->

## Memo
Read for the seminar.

Compare with the RNN baseline.
<!-- book-reader:end -->
`);
});

test("render → parse → render is the identity, and parse gives the state back", () => {
  const markdown = renderNote(state, { before: "", after: "\n\nMy own thoughts, with a [[link]].\n" });
  const parsed = parseNote(markdown);
  assert.deepEqual(parsed.state, state);
  assert.deepEqual(parsed.outside, { before: "", after: "\n\nMy own thoughts, with a [[link]].\n" });
  assert.equal(renderNote(parsed.state, parsed.outside), markdown);
});

test("what the reader wrote outside the block is theirs, before and after", () => {
  const before = "A line I wrote above the block.\n\n";
  const after = "\n\n## My reading\n\nLinks to [[Transformer]].\n";
  const markdown = renderNote(state, { before, after });
  const parsed = parseNote(markdown);
  assert.equal(parsed.outside.before, before);
  assert.equal(parsed.outside.after, after);
  // Re-rendered with a changed memo: only the block moves.
  const changed = renderNote({ ...parsed.state, memo: "Different." }, parsed.outside);
  assert.ok(changed.startsWith(markdown.slice(0, markdown.indexOf("<!-- book-reader:start -->")) ));
  assert.ok(changed.endsWith(after));
});

test("a note with no block is all the reader's, and a broken block does not throw", () => {
  const plain = "---\ntitle: Plain\n---\nJust my notes.\n";
  const parsed = parseNote(plain);
  assert.deepEqual(parsed.state.highlights, []);
  assert.equal(parsed.state.memo, "");
  assert.equal(parsed.state.frontmatter.title, "Plain");
  assert.equal(parsed.outside.before, "");
  assert.equal(parsed.outside.after, "Just my notes.\n");

  const broken = `---
title: Broken
---
<!-- book-reader:start -->
> [!quote] p.2 · blue
> A quote with no id comment.
random line
<!-- h: zz pdf:notanumber -->
> [!quote] p.4 · pink
> Fine.
<!-- h: ok1 pdf:4 -->
## Memo
<!-- book-reader:end -->
tail
`;
  const survivors = parseNote(broken);
  assert.deepEqual(survivors.state.highlights.map((h) => h.id), ["ok1"]);
  assert.equal(survivors.state.memo, "");
  assert.equal(survivors.outside.after, "\ntail\n");
  assert.doesNotThrow(() => parseNote(""));
  assert.doesNotThrow(() => parseNote("<!-- book-reader:start -->"));
});

test("frontmatter values that YAML would misread are quoted, and read back", () => {
  const tricky: NoteState = {
    ...state,
    frontmatter: { ...state.frontmatter, title: "Notes: on \"reading\" #1", authors: ["O'Brien, P.", "Zhang"] },
  };
  const parsed = parseNote(renderNote(tricky, { before: "", after: "" }));
  assert.equal(parsed.state.frontmatter.title, "Notes: on \"reading\" #1");
  assert.deepEqual(parsed.state.frontmatter.authors, ["O'Brien, P.", "Zhang"]);
});

test("properties the reader added in Obsidian survive the app rewriting the frontmatter", () => {
  const theirs = `---
title: Attention Is All You Need
added: 2026-09-13
status: reading
tags: [paper, transformers]
rating: 5
related: "[[Transformer]]"
---
<!-- book-reader:start -->
<!-- book-reader:end -->
`;
  const parsed = parseNote(theirs);
  assert.deepEqual(parsed.state.frontmatter.tags, ["paper", "transformers"]);
  assert.deepEqual(parsed.state.frontmatter.extra, ["rating: 5", "related: \"[[Transformer]]\""]);
  const rewritten = renderNote({ ...parsed.state, memo: "Now with a memo." }, parsed.outside);
  assert.match(rewritten, /^rating: 5$/m);
  assert.match(rewritten, /^related: "\[\[Transformer\]\]"$/m);
  assert.match(rewritten, /^tags: \[paper, transformers\]$/m);
});
