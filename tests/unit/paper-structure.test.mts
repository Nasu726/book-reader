import assert from "node:assert/strict";
import { test } from "node:test";

import { inferPaperStructure } from "../../src/core/documents/paper-structure.ts";
import { buildContext } from "../../src/core/context/builder.ts";

const paperText = [
  "Deterministic Reading",
  "Alpha Author and Beta Author",
  "",
  "Abstract",
  "This paper studies deterministic extraction.",
  "Introduction",
  "Readers need stable context.",
  "Methods",
  "We infer headings deterministically.",
  "Results",
  "The pipeline preserves order.",
  "Discussion",
  "Limitations remain for unusual layouts.",
  "Conclusion",
  "Heuristics can fail safely.",
  "References",
  "[1] Deterministic extraction.",
].join("\n");

test("paper inference extracts metadata, abstract, and major sections", () => {
  const structure = inferPaperStructure(paperText);

  assert.equal(structure.title, "Deterministic Reading");
  assert.equal(structure.authors, "Alpha Author and Beta Author");
  assert.equal(structure.abstract, "This paper studies deterministic extraction.");
  assert.deepEqual(structure.sections.map((section) => section.title), [
    "abstract",
    "introduction",
    "methods",
    "results",
    "discussion",
    "conclusion",
    "references",
  ]);
});

test("paper inference returns safe fallback for ordinary text", () => {
  const structure = inferPaperStructure("A short paragraph.\nAnother paragraph.");

  assert.equal(structure.title, undefined);
  assert.equal(structure.authors, undefined);
  assert.equal(structure.abstract, undefined);
  assert.deepEqual(structure.sections, []);
});

test("paper inference returns safe fallback for whitespace-only text", () => {
  assert.deepEqual(inferPaperStructure("\n\n"), { sections: [] });
});

test("context builder includes bounded paper provenance", () => {
  const context = buildContext({
    paperStructure: {
      abstract: "Core research summary.",
      sectionTitle: "Methods",
      title: "Paper title",
    },
    selectedText: "selected sentence",
  });

  assert.match(context, /Selected: selected sentence/);
  assert.match(context, /Paper title: Paper title/);
  assert.match(context, /Paper section: Methods/);
  assert.match(context, /Abstract: Core research summary\./);
});
