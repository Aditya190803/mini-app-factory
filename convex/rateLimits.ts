import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { requireUserId } from './auth';

/**
 * Durable per-user rate limits and quotas for the expensive API routes.
 *
 * The limits live here, keyed by bucket name, and the counter is keyed by the
 * verified identity. Neither comes from an argument the caller controls, so a
 * direct call to this public mutation can only ever spend the caller's own
 * budget.
 *
 * The per-minute buckets smooth bursts; `ai-daily` and `ai-monthly` cap total spend on the
 * platform's model keys. Per-minute limits alone allowed ~14k generations per user per day.
 * Requests that run on the user's own key (BYOK) skip the daily and monthly quotas.
 */
const DAY = 24 * 60 * 60 * 1000;

function envLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const RATE_LIMITS = {
  generate: { limit: 10, windowMs: 60_000 },
  transform: { limit: 20, windowMs: 60_000 },
  discuss: { limit: 20, windowMs: 60_000 },
  readme: { limit: 5, windowMs: 60_000 },
  'github-sync': { limit: 10, windowMs: 60_000 },
  deploy: { limit: 10, windowMs: 60_000 },
  'url-context': { limit: 15, windowMs: 60_000 },
  'check-name': { limit: 20, windowMs: 60_000 },
  'validate-key': { limit: 10, windowMs: 60_000 },
  'ai-daily': { limit: 100, windowMs: DAY },
  'ai-monthly': { limit: 1500, windowMs: 30 * DAY },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/** Quota overrides, set on the Convex deployment: `npx convex env set MAF_AI_DAILY_LIMIT 200`. */
function limitFor(bucket: RateLimitBucket) {
  if (bucket === 'ai-daily') return envLimit('MAF_AI_DAILY_LIMIT', RATE_LIMITS[bucket].limit);
  if (bucket === 'ai-monthly') return envLimit('MAF_AI_MONTHLY_LIMIT', RATE_LIMITS[bucket].limit);
  return RATE_LIMITS[bucket].limit;
}

const bucketValidator = v.union(
  v.literal('generate'),
  v.literal('transform'),
  v.literal('discuss'),
  v.literal('readme'),
  v.literal('github-sync'),
  v.literal('deploy'),
  v.literal('url-context'),
  v.literal('check-name'),
  v.literal('validate-key'),
  v.literal('ai-daily'),
  v.literal('ai-monthly'),
);

type Result = { allowed: boolean; remaining: number; resetAt: number; bucket: RateLimitBucket };

async function peek(ctx: MutationCtx, userId: string, bucket: RateLimitBucket, now: number) {
  const key = `${bucket}:${userId}`;
  const row = await ctx.db.query('rateLimits').withIndex('by_key', (q) => q.eq('key', key)).unique();
  const live = row && row.resetAt > now ? row : null;
  return { key, row, count: live?.count ?? 0, resetAt: live?.resetAt ?? now + RATE_LIMITS[bucket].windowMs };
}

/**
 * Consume one unit from every listed bucket, or from none: if any bucket is exhausted, nothing is
 * charged and the first exhausted bucket is reported.
 */
export const consume = mutation({
  args: { bucket: bucketValidator, also: v.optional(v.array(bucketValidator)) },
  handler: async (ctx, args): Promise<Result> => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const buckets = [args.bucket, ...(args.also ?? [])];
    const states = await Promise.all(buckets.map((bucket) => peek(ctx, userId, bucket, now)));
    for (const [index, bucket] of buckets.entries()) {
      const state = states[index]!;
      if (state.count >= limitFor(bucket)) {
        return { allowed: false, remaining: 0, resetAt: state.resetAt, bucket };
      }
    }
    for (const state of states) {
      if (!state.row) await ctx.db.insert('rateLimits', { key: state.key, count: 1, resetAt: state.resetAt });
      else await ctx.db.patch(state.row._id, { count: state.count + 1, resetAt: state.resetAt });
    }
    const first = states[0]!;
    return { allowed: true, remaining: limitFor(args.bucket) - first.count - 1, resetAt: first.resetAt, bucket: args.bucket };
  },
});

/** The caller's AI quota, for display. */
export const getAiQuota = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const read = async (bucket: 'ai-daily' | 'ai-monthly') => {
      const row = await ctx.db.query('rateLimits').withIndex('by_key', (q) => q.eq('key', `${bucket}:${userId}`)).unique();
      const used = row && row.resetAt > now ? row.count : 0;
      return { used, limit: limitFor(bucket), resetAt: row && row.resetAt > now ? row.resetAt : null };
    };
    return { daily: await read('ai-daily'), monthly: await read('ai-monthly') };
  },
});
