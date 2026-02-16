import { MAX_RATE_LIMIT_ENTRIES } from './constants';
import { logger } from './logger';

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

/**
 * In-memory rate limiter (single-instance fallback).
 */
function checkRateLimitInMemory(params: {
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

// ---------------------------------------------------------------------------
// Redis-backed distributed rate limiter (used when Upstash is configured)
// ---------------------------------------------------------------------------

let redisRateLimitAvailable: boolean | null = null;

async function getRedisForRateLimit() {
  try {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) return null;
    return new Redis({ url, token });
  } catch {
    return null;
  }
}

async function checkRateLimitRedis(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult | null> {
  const redis = await getRedisForRateLimit();
  if (!redis) return null;

  const { key, limit, windowMs } = params;
  const redisKey = `rl:${key}`;
  const windowSec = Math.ceil(windowMs / 1000);

  try {
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSec);
    }
    const ttl = await redis.ttl(redisKey);
    const resetAt = Date.now() + ttl * 1000;
    const allowed = count <= limit;
    return { allowed, remaining: Math.max(0, limit - count), resetAt };
  } catch (err) {
    logger.warn('Redis rate limit failed, falling back to in-memory', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Rate limit check — uses distributed Redis when Upstash is configured,
 * falls back to in-memory for single-instance deployments.
 */
export async function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<RateLimitResult> {
  // Try Redis first if available
  if (redisRateLimitAvailable !== false) {
    const result = await checkRateLimitRedis(params);
    if (result) {
      redisRateLimitAvailable = true;
      return result;
    }
    redisRateLimitAvailable = false;
  }

  return checkRateLimitInMemory(params);
}
