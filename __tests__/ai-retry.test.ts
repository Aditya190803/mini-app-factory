import { describe, expect, test, vi } from 'vitest';
import { withRetry } from '@/lib/ai-retry';

describe('withRetry', () => {
  test('aborts during backoff without waiting full delay', async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    const task = vi.fn().mockRejectedValue(new Error('transient 503'));

    const p = withRetry(task, { maxAttempts: 3, baseDelayMs: 5000, signal: ac.signal });
    await Promise.resolve();
    ac.abort();

    await expect(p).rejects.toMatchObject({ code: 'ABORTED' });
    expect(task).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});