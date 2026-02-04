type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

export function isTransientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lowered = message.toLowerCase();
  return (
    /timeout|timed out|etimedout|econnreset|econnrefused|enotfound|eai_again/.test(lowered) ||
    /rate.?limit|429/.test(lowered) ||
    /5\d\d/.test(lowered) ||
    /provider error|upstream|temporarily unavailable/.test(lowered)
  );
}

export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs = 8000, shouldRetry } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const retryable = shouldRetry ? shouldRetry(error) : isTransientError(error);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError;
}
