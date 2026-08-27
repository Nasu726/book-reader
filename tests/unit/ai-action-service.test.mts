import assert from "node:assert/strict";
import { test } from "node:test";

import { createMockAiProvider } from "../../src/core/ai/mock-provider.ts";
import type { PaperStructure } from "../../src/core/documents/paper-structure.ts";
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

const paperStructure: PaperStructure = {
  abstract: "Core research summary.",
  sections: [
    { content: "Unrelated introduction text.", title: "Introduction" },
    { content: "Before the important sentence and after it.", title: "Results" },
  ],
  title: "Paper title",
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
      sourceLanguage: "auto",
      userQuestion: "Why is this important?",
    });

    assert.equal(response, `OK ${action}`);
  }
});

test("highlight actions do not invoke providers", async () => {
  const provider = createMockAiProvider({ response: "unexpected provider response" });
  const response = await runAiAction(provider, {
    ...baseInput,
    action: "highlight",
  });

  assert.equal(response, "Highlight saved locally.");
});

test("prompt construction centralizes instructions and prioritizes selection", () => {
  assert.match(buildPrompt({ ...baseInput, action: "explain" }).prompt, /Explain the selected text/);
  assert.match(buildPrompt({ ...baseInput, action: "translate", targetLanguage: "Japanese" }).prompt, /into Japanese/);
  // "auto" is a placeholder, not a language. Someone reading in several
  // languages must not have one assumed, and the model should not be handed
  // "translate from auto" as if that were an instruction.
  const autoSource = buildPrompt({
    ...baseInput,
    action: "translate",
    sourceLanguage: "auto",
    targetLanguage: "Portuguese",
  }).prompt;
  assert.match(autoSource, /Translate the selected text into Portuguese/);
  assert.ok(!autoSource.includes("from auto"));

  assert.match(
    buildPrompt({
      ...baseInput,
      action: "translate",
      sourceLanguage: "French",
      targetLanguage: "Portuguese",
    }).prompt,
    /from French into Portuguese/,
  );

  assert.throws(
    () => buildPrompt({ ...baseInput, action: "translate", targetLanguage: "  " }),
    AiActionError,
  );
  assert.match(buildPrompt({ ...baseInput, action: "simplify" }).prompt, /Simplify the selected text/);

  // The answer language applies to every action except translate, which already
  // names its target and would otherwise be told twice.
  assert.match(
    buildPrompt({ ...baseInput, action: "explain", responseLanguage: "Japanese" }).prompt,
    /Respond in Japanese\./,
  );
  const translated = buildPrompt({
    ...baseInput,
    action: "translate",
    responseLanguage: "Japanese",
    targetLanguage: "Japanese",
  }).prompt;
  assert.equal(translated.match(/Japanese/g)?.length, 1);
  assert.match(buildPrompt({ ...baseInput, action: "ask", userQuestion: "Why?" }).prompt, /Question: Why\?/);
  assert.equal(
    buildPrompt({ ...baseInput, action: "explain" }).context,
    "Document: Paper\n\nBefore text\n\nAfter text",
  );
});

test("paper structure adds matching section provenance to AI context", () => {
  const context = buildPrompt({
    ...baseInput,
    action: "explain",
    paperStructure,
  }).context;

  assert.match(context, /Paper title: Paper title/);
  assert.match(context, /Section: Results/);
  assert.match(context, /Abstract: Core research summary\./);
  assert.doesNotMatch(context, /Section: Introduction/);
});

test("paper structure without a matching selection omits section provenance", () => {
  const context = buildPrompt({
    ...baseInput,
    action: "explain",
    paperStructure: { ...paperStructure, sections: [] },
  }).context;

  assert.match(context, /Paper title: Paper title/);
  assert.match(context, /Abstract: Core research summary\./);
  assert.doesNotMatch(context, /Section:/);
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
