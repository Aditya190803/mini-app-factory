import 'server-only';

import { api } from '@/convex/_generated/api';
import type { RateLimitBucket } from '@/convex/rateLimits';

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  bucket?: RateLimitBucket;
};

/**
 * The limit the API routes use. Counts in Convex so it holds across server instances.
 *
 * Fails closed. It used to fall back to a per-instance in-memory counter whenever Convex errored,
 * which on a serverless host meant a fresh counter per instance — effectively no limit, on the
 * routes that spend money. Nothing else in the app works while Convex is unreachable anyway.
 *
 * `also` charges extra buckets atomically with the first, e.g. the daily and monthly AI quotas.
 */
export async function consumeRateLimit(
  bucket: RateLimitBucket,
  _userId: string,
  also: RateLimitBucket[] = []
): Promise<RateLimitResult> {
  try {
    const { getAuthedConvexClient } = await import('@/lib/convex-server');
    const client = await getAuthedConvexClient();
    return await client.mutation(api.rateLimits.consume, { bucket, ...(also.length ? { also } : {}) });
  } catch {
    return { allowed: false, remaining: 0, resetAt: Date.now() + 30_000, bucket };
  }
}

/** Buckets an AI request charges on top of its per-minute bucket. BYOK requests skip the quota. */
export function aiQuotaBuckets(usesOwnKey: boolean): RateLimitBucket[] {
  return usesOwnKey ? [] : ['ai-daily', 'ai-monthly'];
}

export function retryAfterSeconds(result: RateLimitResult): number {
  return Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
}

/** The standard 429 response. Quota exhaustion gets its own code so the UI can offer BYOK. */
export function rateLimitedResponse(result: RateLimitResult, requestId?: string): Response {
  const retryAfter = retryAfterSeconds(result);
  const quota = result.bucket === 'ai-daily' || result.bucket === 'ai-monthly';
  return Response.json(
    {
      error: quota
        ? `You have used your ${result.bucket === 'ai-daily' ? 'daily' : 'monthly'} AI allowance. Add your own API key in Settings to keep building, or try again later.`
        : 'Rate limit exceeded. Please wait before retrying.',
      code: quota ? 'QUOTA_EXCEEDED' : 'RATE_LIMITED',
      retryAfter,
      ...(requestId ? { requestId } : {}),
    },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } }
  );
}
