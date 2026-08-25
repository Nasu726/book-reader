import {
  AiProviderError,
  type AiProvider,
  type AiRequest,
  type AiResponse,
} from "@/core/ai/provider";

export type OpenRouterProviderOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export class OpenRouterProvider implements AiProvider {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: OpenRouterProviderOptions) {
    if (!options.apiKey || !options.model) {
      throw new AiProviderError("Provider configuration is incomplete.", {
        reason: "invalid_request",
      });
    }
    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#baseUrl = options.baseUrl ?? "https://openrouter.ai/api/v1";
    this.#fetch = options.fetch ?? fetch;
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.#apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.#model,
          messages: [
            ...(request.context ? [
              { role: "system", content: request.context },
            ] : []),
            { role: "user", content: request.prompt },
          ],
        }),
        signal: request.signal,
      });
    } catch (cause) {
      throw new AiProviderError("The provider request failed.", {
        reason: request.signal?.aborted ? "cancelled" : "provider_error",
        retryable: !request.signal?.aborted,
        cause,
      });
    }

    if (!response.ok) {
      throw new AiProviderError("The provider rejected the request.", {
        reason: response.status === 400 ? "invalid_request" : "provider_error",
        retryable: response.status >= 500,
      });
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new AiProviderError("The provider response was invalid.", {
        reason: "provider_error",
      });
    }

    return { content };
  }
}
