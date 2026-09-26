import { v } from 'convex/values';
import { mutation } from './_generated/server';
import { requireUserId } from './auth';

/**
 * Durable per-user rate limits for the expensive API routes.
 *
 * The limits live here, keyed by bucket name, and the counter is keyed by the
 * verified identity. Neither comes from an argument the caller controls, so a
 * direct call to this public mutation can only ever spend the caller's own
 * budget.
 */
export const RATE_LIMITS = {
  generate: { limit: 10, windowMs: 60_000 },
  transform: { limit: 20, windowMs: 60_000 },
  discuss: { limit: 20, windowMs: 60_000 },
  'url-context': { limit: 15, windowMs: 60_000 },
  'check-name': { limit: 20, windowMs: 60_000 },
  'validate-key': { limit: 10, windowMs: 60_000 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

const bucket = v.union(
  v.literal('generate'),
  v.literal('transform'),
  v.literal('discuss'),
  v.literal('url-context'),
  v.literal('check-name'),
  v.literal('validate-key'),
);

export const consume = mutation({
  args: { bucket },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { limit, windowMs } = RATE_LIMITS[args.bucket];
    const key = `${args.bucket}:${userId}`;
    const now = Date.now();

    const existing = await ctx.db
      .query('rateLimits')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      if (existing) await ctx.db.patch(existing._id, { count: 1, resetAt });
      else await ctx.db.insert('rateLimits', { key, count: 1, resetAt });
      return { allowed: true, remaining: limit - 1, resetAt };
    }

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: existing.resetAt };
    }

    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { allowed: true, remaining: limit - existing.count - 1, resetAt: existing.resetAt };
  },
});
