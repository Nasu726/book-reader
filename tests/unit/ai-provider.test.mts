import assert from "node:assert/strict";
import { test } from "node:test";

import { createMockAiProvider } from "../../src/core/ai/mock-provider.ts";
import {
  AiProviderError,
  generateWithTimeout,
} from "../../src/core/ai/provider.ts";

test("mock provider returns normalized success responses", async () => {
  const provider = createMockAiProvider({ response: "Ready" });
  const response = await generateWithTimeout(provider, {
    prompt: "Explain this",
    context: "Document text",
  });

  assert.deepEqual(response, { content: "Ready" });
});

test("provider failures are normalized as AiProviderError", async () => {
  const provider = createMockAiProvider({ failure: "provider_error" });

  await assert.rejects(
    generateWithTimeout(provider, { prompt: "Ask" }),
    (error: unknown) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.reason, "provider_error");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("requests time out and remain retryable", async () => {
  const provider = createMockAiProvider({ failure: "timeout" });

  await assert.rejects(
    generateWithTimeout(provider, { prompt: "Slow request" }, 20),
    (error: unknown) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.reason, "timeout");
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test("external cancellation is distinguished from timeout", async () => {
  const controller = new AbortController();
  const provider = createMockAiProvider({ failure: "timeout" });
  const pending = generateWithTimeout(
    provider,
    { prompt: "Cancel me", signal: controller.signal },
    1000,
  );
  controller.abort();

  await assert.rejects(pending, (error: unknown) => {
    assert.ok(error instanceof AiProviderError);
    assert.equal(error.reason, "cancelled");
    return true;
  });
});
