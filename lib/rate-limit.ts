import { MAX_RATE_LIMIT_ENTRIES } from './constants';

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

/** Prune expired entries to prevent unbounded memory growth. */
function pruneBuckets() {
  if (buckets.size <= MAX_RATE_LIMIT_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
  // If still over limit after pruning expired, drop oldest entries
  if (buckets.size > MAX_RATE_LIMIT_ENTRIES) {
    const excess = buckets.size - MAX_RATE_LIMIT_ENTRIES;
    const keys = buckets.keys();
    for (let i = 0; i < excess; i++) {
      const next = keys.next();
      if (!next.done) buckets.delete(next.value);
    }
  }
}

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const { key, limit, windowMs } = params;

  // Periodically prune to prevent memory leaks
  pruneBuckets();

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}
