import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCommand } from "../../src/core/ai/action-service.ts";

test("a leading slash command names the action", () => {
  assert.deepEqual(parseCommand("/explain"), { action: "explain", question: "" });
  assert.deepEqual(parseCommand("/translate"), { action: "translate", question: "" });
  assert.deepEqual(parseCommand("  /simplify  "), { action: "simplify", question: "" });
  // Case is what a person typed, not what they meant.
  assert.deepEqual(parseCommand("/Explain"), { action: "explain", question: "" });
});

test("a command can carry a question of its own", () => {
  assert.deepEqual(
    parseCommand("/explain in one sentence"),
    { action: "explain", question: "in one sentence" },
  );
  assert.deepEqual(
    parseCommand("/translate\nkeep the tone"),
    { action: "translate", question: "keep the tone" },
  );
});

test("anything else is a question", () => {
  assert.deepEqual(
    parseCommand("Why does this matter?"),
    { action: "ask", question: "Why does this matter?" },
  );
  // An unknown command is not a command; it is what the reader typed.
  assert.deepEqual(parseCommand("/summarise"), { action: "ask", question: "/summarise" });
  // A slash inside a sentence is a slash.
  assert.deepEqual(
    parseCommand("what does and/or mean"),
    { action: "ask", question: "what does and/or mean" },
  );
  assert.deepEqual(parseCommand("   "), { action: "ask", question: "" });
});

test("highlight is not something the composer can name", () => {
  // It is not an AI action, and it needs a colour the composer cannot ask for.
  assert.deepEqual(parseCommand("/highlight"), { action: "ask", question: "/highlight" });
});
