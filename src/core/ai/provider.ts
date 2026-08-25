export type AiRequest = {
  prompt: string;
  context?: string;
  signal?: AbortSignal;
};

export type AiResponse = {
  content: string;
};

export type AiProviderConfig = {
  provider: string;
  model?: string;
};

export class AiProviderError extends Error {
  readonly reason:
    | "invalid_request"
    | "timeout"
    | "cancelled"
    | "provider_error";
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      reason: "invalid_request" | "timeout" | "cancelled" | "provider_error";
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "AiProviderError";
    this.reason = options.reason;
    this.retryable = options.retryable ?? false;
  }
}

export interface AiProvider {
  generate(request: AiRequest): Promise<AiResponse>;
}

export async function generateWithTimeout(
  provider: AiProvider,
  request: AiRequest,
  timeoutMs = 30_000,
): Promise<AiResponse> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AiProviderError("Invalid timeout.", {
      reason: "invalid_request",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  request.signal?.addEventListener("abort", () => controller.abort(), {
    once: true,
  });

  try {
    return await provider.generate({ ...request, signal: controller.signal });
  } catch (cause) {
    if (controller.signal.aborted && request.signal?.aborted) {
      throw new AiProviderError("The request was cancelled.", {
        reason: "cancelled",
        cause,
      });
    }
    if (controller.signal.aborted) {
      throw new AiProviderError("The request timed out.", {
        reason: "timeout",
        retryable: true,
        cause,
      });
    }
    if (cause instanceof AiProviderError) {
      throw cause;
    }
    throw new AiProviderError("The AI request failed.", {
      reason: "provider_error",
      retryable: true,
      cause,
    });
  } finally {
    clearTimeout(timeout);
  }
}
