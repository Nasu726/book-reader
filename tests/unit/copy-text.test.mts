import assert from "node:assert/strict";
import { test } from "node:test";

import { citation, copyableText } from "../../src/core/selection/copy-text.ts";

test("copied text is prose: lines joined, hyphenation undone, paragraphs kept", () => {
  assert.equal(
    copyableText("Multi-head attention allows the model to jointly at-\ntend to information\nfrom different subspaces.\n\nIn this work we\nuse eight heads."),
    "Multi-head attention allows the model to jointly attend to information from different subspaces.\n\nIn this work we use eight heads.",
  );
  assert.equal(copyableText("  \n \n"), "");
});

test("a citation names the document, the section and the page it has", () => {
  assert.equal(
    citation("Attention is all you need.", { title: "Transformers", section: "3.2 Attention", page: 4 }),
    "Attention is all you need.\n\n— Transformers, §3.2 Attention, p.4",
  );
  assert.equal(
    citation("Alpha journey text.", { title: "Notes on Thinking Machines", section: "1. The Analytical Engine" }),
    "Alpha journey text.\n\n— Notes on Thinking Machines, §1. The Analytical Engine",
  );
  // Nothing known but the text: no dangling dash.
  assert.equal(citation("Just this.", {}), "Just this.");
  assert.equal(citation("Just this.", { title: "  " }), "Just this.");
});
