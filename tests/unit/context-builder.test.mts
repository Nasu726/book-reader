import assert from "node:assert/strict";
import { test } from "node:test";

import { buildContext } from "../../src/core/context/builder.ts";

test("buildContext prioritizes selected text and question", () => {
  const context = buildContext({
    documentTitle: "Paper",
    selectedText: "important sentence",
    surroundingText: { before: "before", after: "after" },
    userQuestion: "Why?",
  });

  assert.match(context, /Selected: important sentence/);
  assert.match(context, /Question: Why\?/);
});

test("buildContext retains source provenance for surrounding text", () => {
  const context = buildContext({
    documentTitle: "Paper",
    sectionTitle: "Introduction",
    selectedText: "important sentence",
    surroundingText: { before: "before", after: "after" },
  });

  assert.match(context, /Document: Paper/);
  assert.match(context, /Section: Introduction/);
  assert.match(context, /Before source: before/);
  assert.match(context, /After source: after/);
});

test("buildContext deterministically trims oversized context around selection", () => {
  const context = buildContext({
    selectedText: "selection",
    surroundingText: {
      before: "b".repeat(1000),
      after: "a".repeat(1000),
    },
    tokenBudget: 20,
  });

  assert.ok(context.startsWith("Selected: selection"));
  const beforeSource = context.match(/Before source: (b+)/)?.[1] ?? "";
  const afterSource = context.match(/After source: (a+)/)?.[1] ?? "";
  assert.equal(beforeSource.length, 44);
  assert.equal(afterSource.length, 0);
  assert.ok(context.length <= 100);
});

test("buildContext rejects invalid budgets", () => {
  assert.throws(
    () => buildContext({ selectedText: "x", tokenBudget: 0 }),
    /Token budget/,
  );
});
