import assert from "node:assert/strict";
import { test } from "node:test";

import { createMockAiProvider } from "../../src/core/ai/mock-provider.ts";
import {
  AiActionError,
  buildPrompt,
  runAiAction,
} from "../../src/core/ai/action-service.ts";

const baseInput = {
  selectedText: "important sentence",
  documentTitle: "Paper",
  surroundingText: { before: "Before text", after: "After text" },
};

test("all supported actions use mock providers successfully", async () => {
  for (const action of [
    "explain",
    "translate",
    "simplify",
    "ask",
  ] as const) {
    const provider = createMockAiProvider({ response: `OK ${action}` });
    const response = await runAiAction(provider, {
      ...baseInput,
      action,
      targetLanguage: "Japanese",
      userQuestion: "Why is this important?",
    });

    assert.equal(response, `OK ${action}`);
  }
});

test("prompt construction centralizes instructions and prioritizes selection", () => {
  assert.match(buildPrompt({ ...baseInput, action: "explain" }).prompt, /Explain the selected text/);
  assert.match(buildPrompt({ ...baseInput, action: "translate", targetLanguage: "Japanese" }).prompt, /into Japanese/);
  assert.match(buildPrompt({ ...baseInput, action: "simplify" }).prompt, /Simplify the selected text/);
  assert.match(buildPrompt({ ...baseInput, action: "ask", userQuestion: "Why?" }).prompt, /Question: Why\?/);
  assert.equal(
    buildPrompt({ ...baseInput, action: "explain" }).context,
    "Document: Paper\n\nBefore text\n\nAfter text",
  );
});

test("provider failures return actionable UI-safe errors", async () => {
  await assert.rejects(
    runAiAction(createMockAiProvider({ failure: "provider_error" }), {
      ...baseInput,
      action: "explain",
    }),
    (error: unknown) => {
      assert.ok(error instanceof AiActionError);
      assert.equal(error.code, "provider_unavailable");
      assert.match(error.message, /Please try again/);
      return true;
    },
  );
});

test("empty selections are rejected before provider calls", async () => {
  await assert.rejects(
    runAiAction(createMockAiProvider(), {
      selectedText: " ",
      action: "explain",
    }),
    (error: unknown) => {
      assert.ok(error instanceof AiActionError);
      assert.equal(error.code, "empty_selection");
      return true;
    },
  );
});
