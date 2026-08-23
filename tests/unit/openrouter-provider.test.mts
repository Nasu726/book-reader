import assert from "node:assert/strict";
import { test } from "node:test";

import { OpenRouterProvider } from "../../src/server/ai/openrouter-provider.ts";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

test("OpenRouter adapter normalizes successful responses", async () => {
  let authorization = "";
  const provider = new OpenRouterProvider({
    apiKey: "server-key",
    model: "mock-model",
    baseUrl: "https://provider.test/v1",
    fetch: async (input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return jsonResponse({
        choices: [{ message: { content: "OK" } }],
      });
    },
  });

  const response = await provider.generate({ prompt: "Ping" });
  assert.deepEqual(response, { content: "OK" });
  assert.equal(authorization, "Bearer server-key");
});

test("OpenRouter adapter normalizes provider failures", async () => {
  for (const [status, reason] of [
    [400, "invalid_request"],
    [500, "provider_error"],
    [502, "provider_error"],
  ] as const) {
    const provider = new OpenRouterProvider({
      apiKey: "key",
      model: "model",
      fetch: async () => jsonResponse({ error: "failure" }, status),
    });

    try {
      await provider.generate({ prompt: "Ping" });
      assert.fail("expected provider failure");
    } catch (error) {
      assert.equal((error as Error).message, "The provider rejected the request.");
      assert.equal(
        Object.getOwnPropertyDescriptor(error, "reason")?.value,
        reason,
      );
    }
  }
});
