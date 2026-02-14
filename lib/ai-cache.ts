import { Redis } from '@upstash/redis';
import { DESIGN_SPEC_CACHE_TTL_MS } from './constants';

const CACHE_PREFIX = 'design-spec:';

function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set');
  }
  return new Redis({ url, token });
}

export async function getCachedDesignSpec(key: string): Promise<string | null> {
  try {
    const value = await getRedis().get<string>(`${CACHE_PREFIX}${key}`);
    return value ?? null;
  } catch (err) {
    console.warn('Upstash cache read failed, skipping:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function setCachedDesignSpec(key: string, value: string, ttlMs = DESIGN_SPEC_CACHE_TTL_MS) {
  try {
    const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));
    await getRedis().set(`${CACHE_PREFIX}${key}`, value, { ex: ttlSeconds });
  } catch (err) {
    console.warn('Upstash cache write failed, skipping:', err instanceof Error ? err.message : err);
  }
}
