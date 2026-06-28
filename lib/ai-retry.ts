type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  signal?: AbortSignal;
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

function abortedError(): Error & { code: string } {
  return Object.assign(new Error('Aborted'), { code: 'ABORTED' });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortedError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetry<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs = 8000, shouldRetry, signal } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (signal?.aborted) throw abortedError();
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw abortedError();
      const retryable = shouldRetry ? shouldRetry(error) : isTransientError(error);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      await sleep(backoff, signal);
    }
  }

  throw lastError;
}
