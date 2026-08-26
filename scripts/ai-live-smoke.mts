import { OpenRouterProvider } from "../src/server/ai/openrouter-provider.ts";
import { AiProviderError, generateWithRetry } from "../src/core/ai/provider.ts";

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.AI_MODEL;

if (!apiKey || !model) {
  console.log("Live smoke test skipped: credential or model is not configured.");
  process.exit(0);
}

const provider = new OpenRouterProvider({ apiKey, model });

try {
  const response = await generateWithRetry(
    provider,
    { prompt: "Reply with the exact text: OK" },
    { attempts: 4, timeoutMs: 60_000 },
  );

  // Free models are chatty; the point of this check is that a real answer came
  // back through the real adapter, not that the wording matched exactly.
  if (!response.content.trim()) {
    console.error("Live smoke test failed: the provider returned an empty answer.");
    process.exit(1);
  }
  console.log(`Live smoke test passed via ${model}.`);
  console.log(`Answer: ${response.content.trim().slice(0, 200)}`);
} catch (error) {
  if (error instanceof AiProviderError) {
    console.error(
      `Live smoke test failed: ${error.reason}`,
      error.status ? `(HTTP ${error.status})` : "",
    );
    if (typeof error.cause === "string") console.error(error.cause.slice(0, 500));
  } else {
    console.error("Live smoke test failed:", error);
  }
  process.exit(1);
}
