import { OpenRouterProvider } from "../src/server/ai/openrouter-provider.ts";
import { generateWithTimeout } from "../src/core/ai/provider.ts";

const apiKey = process.env.OPENROUTER_API_KEY;
const model = process.env.AI_MODEL;

if (!apiKey || !model) {
  console.log("Live smoke test skipped: credential or model is not configured.");
  process.exit(0);
}

const provider = new OpenRouterProvider({ apiKey, model });
const response = await generateWithTimeout(provider, {
  prompt: "Reply with the exact text: OK",
}, 20_000);

if (response.content.trim() !== "OK") {
  console.error("Live smoke test failed.");
  process.exit(1);
}

console.log("Live smoke test passed.");
