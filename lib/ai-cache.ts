import { Redis } from '@upstash/redis';
import { DESIGN_SPEC_CACHE_TTL_MS } from './constants';
import { logger } from './logger';

const CACHE_PREFIX = 'design-spec:';

let redisInstance: Redis | null = null;

function getRedis(): Redis {
  if (redisInstance) return redisInstance;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  redisInstance = new Redis({ url, token });
  return redisInstance;
}

export async function getCachedDesignSpec(key: string): Promise<string | null> {
  try {
    const value = await getRedis().get<string>(`${CACHE_PREFIX}${key}`);
    return value ?? null;
  } catch (err) {
    logger.warn('Upstash cache read failed, skipping', { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function setCachedDesignSpec(key: string, value: string, ttlMs = DESIGN_SPEC_CACHE_TTL_MS) {
  try {
    const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));
    await getRedis().set(`${CACHE_PREFIX}${key}`, value, { ex: ttlSeconds });
  } catch (err) {
    logger.warn('Upstash cache write failed, skipping', { error: err instanceof Error ? err.message : String(err) });
  }
}
