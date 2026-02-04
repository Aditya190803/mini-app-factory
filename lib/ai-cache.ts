type CacheEntry = {
  value: string;
  expiresAt: number;
};

const designSpecCache = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 1000 * 60 * 15; // 15 minutes

export function getCachedDesignSpec(key: string): string | null {
  const entry = designSpecCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    designSpecCache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedDesignSpec(key: string, value: string, ttlMs = DEFAULT_TTL_MS) {
  designSpecCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}
