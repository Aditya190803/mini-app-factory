import { api } from '@/convex/_generated/api';
import { RATE_LIMITS, type RateLimitBucket } from '@/convex/rateLimits';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const { key, limit, windowMs } = params;

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

/**
 * The limit the API routes use. Counts in Convex so it holds across server
 * instances; the in-process counter above only covers the case where Convex
 * cannot be reached, so an outage degrades to a per-instance limit rather than
 * to none at all.
 */
export async function consumeRateLimit(bucket: RateLimitBucket, userId: string): Promise<RateLimitResult> {
  try {
    const { getAuthedConvexClient } = await import('@/lib/convex-server');
    const client = await getAuthedConvexClient();
    return await client.mutation(api.rateLimits.consume, { bucket });
  } catch {
    return checkRateLimit({ key: `${bucket}:${userId}`, ...RATE_LIMITS[bucket] });
  }
}

export function retryAfterSeconds(result: RateLimitResult): number {
  return Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
}
