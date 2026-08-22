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
