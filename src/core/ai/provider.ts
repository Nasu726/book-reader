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
  /** How long the provider asked us to wait, when it said so. */
  readonly retryAfterMs?: number;
  /** Upstream HTTP status, for server-side diagnosis only. */
  readonly status?: number;

  constructor(
    message: string,
    options: {
      reason: "invalid_request" | "timeout" | "cancelled" | "provider_error";
      retryable?: boolean;
      retryAfterMs?: number;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "AiProviderError";
    this.reason = options.reason;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
    this.status = options.status;
  }
}

export interface AiProvider {
  generate(request: AiRequest): Promise<AiResponse>;
}

/**
 * Retries a request that the provider said was worth retrying.
 *
 * Free and shared model pools answer 429 often enough that a single attempt
 * fails for reasons that have nothing to do with the reader. The provider's own
 * Retry-After wins when it sent one; otherwise the wait doubles each attempt.
 */
export async function generateWithRetry(
  provider: AiProvider,
  request: AiRequest,
  options: {
    attempts?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<AiResponse> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const sleep = options.sleep
    ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await generateWithTimeout(provider, request, options.timeoutMs);
    } catch (error) {
      lastError = error;
      const isLastAttempt = attempt === attempts - 1;
      const retryable = error instanceof AiProviderError && error.retryable;
      if (!retryable || isLastAttempt || request.signal?.aborted) {
        throw error;
      }
      const requested = error instanceof AiProviderError ? error.retryAfterMs : undefined;
      await sleep(requested ?? baseDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
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
