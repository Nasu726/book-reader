import { createMockAiProvider } from "@/core/ai/mock-provider";
import type { AiProvider } from "@/core/ai/provider";
import { OpenRouterProvider } from "./openrouter-provider";

export function createAiProvider(): AiProvider {
  const provider = process.env.AI_PROVIDER ?? "openrouter";
  if (provider === "mock") {
    return createMockAiProvider({ response: "Mock AI response." });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.AI_MODEL;
  if (!apiKey || !model) {
    throw new Error("provider_unavailable");
  }
  return new OpenRouterProvider({ apiKey, model });
}
