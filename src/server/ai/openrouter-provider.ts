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

/** Reads Retry-After, which OpenRouter sends in seconds. */
function readRetryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(seconds, 30) * 1_000
    : undefined;
}

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
      // Free and shared model pools answer 429 routinely; treating it as fatal
      // makes the reader look broken when a short wait would have worked.
      const retryable = response.status === 429 || response.status >= 500;
      throw new AiProviderError("The provider rejected the request.", {
        reason: response.status === 400 ? "invalid_request" : "provider_error",
        retryable,
        retryAfterMs: retryable ? readRetryAfterMs(response) : undefined,
        // Server-side only: the upstream text never reaches the reader, but
        // without it a misconfigured model or key is undiagnosable.
        cause: await response.text().catch(() => undefined),
        status: response.status,
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
