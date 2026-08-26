import assert from "node:assert/strict";
import { test } from "node:test";

import { createMockAiProvider } from "../../src/core/ai/mock-provider.ts";
import {
  AiProviderError,
  generateWithRetry,
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

test("retryable provider failures are retried and can still succeed", async () => {
  const waits: number[] = [];
  let attempts = 0;
  const provider = {
    async generate() {
      attempts += 1;
      if (attempts < 3) {
        throw new AiProviderError("Rate limited.", {
          reason: "provider_error",
          retryable: true,
          retryAfterMs: 5_000,
        });
      }
      return { content: "Recovered." };
    },
  };

  const response = await generateWithRetry(provider, { prompt: "Explain." }, {
    attempts: 3,
    sleep: async (ms) => { waits.push(ms); },
  });

  assert.equal(response.content, "Recovered.");
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [5_000, 5_000]);
});

test("a provider's Retry-After wins over the backoff schedule", async () => {
  const waits: number[] = [];
  const provider = {
    async generate(): Promise<{ content: string }> {
      throw new AiProviderError("Rate limited.", {
        reason: "provider_error",
        retryable: true,
      });
    },
  };

  await assert.rejects(
    generateWithRetry(provider, { prompt: "Explain." }, {
      attempts: 3,
      baseDelayMs: 100,
      sleep: async (ms) => { waits.push(ms); },
    }),
    /Rate limited/,
  );
  assert.deepEqual(waits, [100, 200]);
});

test("non-retryable failures fail on the first attempt", async () => {
  let attempts = 0;
  const provider = {
    async generate(): Promise<{ content: string }> {
      attempts += 1;
      throw new AiProviderError("Bad request.", {
        reason: "invalid_request",
        retryable: false,
      });
    },
  };

  await assert.rejects(
    generateWithRetry(provider, { prompt: "Explain." }, { attempts: 3 }),
    /Bad request/,
  );
  assert.equal(attempts, 1);
});
