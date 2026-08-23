import {
  AiProviderError,
  type AiProvider,
  type AiResponse,
} from "./provider.ts";

export type MockAiProviderOptions = {
  response?: string;
  failure?: "timeout" | "provider_error";
};

export function createMockAiProvider(
  options: MockAiProviderOptions = {},
): AiProvider & { calls: unknown[] } {
  return {
    calls: [],
    async generate(request) {
      this.calls.push(request);
      if (options.failure === "timeout") {
        await new Promise((_, reject) => {
          request.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        });
      }
      if (options.failure === "provider_error") {
        throw new AiProviderError("Mock failure.", {
          reason: "provider_error",
          retryable: true,
        });
      }

      const response: AiResponse = {
        content: options.response ?? `Mock reply to: ${request.prompt}`,
      };
      return response;
    },
  };
}
