/// <reference types="vite/client" />
import { afterEach, describe, test, expect, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from '@/convex/schema';
import { api } from '@/convex/_generated/api';
import { RATE_LIMITS } from '@/convex/rateLimits';

const modules = import.meta.glob('../convex/**/*.ts');

const ALICE = { subject: 'user_alice' };
const BOB = { subject: 'user_bob' };

describe('rateLimits.consume', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('refuses anonymous callers', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.rateLimits.consume, { bucket: 'generate' })).rejects.toThrow(
      'Not authenticated'
    );
  });

  test('allows up to the bucket limit, then refuses until the window resets', async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const { limit, windowMs } = RATE_LIMITS.generate;

    for (let i = 0; i < limit; i++) {
      const result = await alice.mutation(api.rateLimits.consume, { bucket: 'generate' });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(limit - i - 1);
    }

    const refused = await alice.mutation(api.rateLimits.consume, { bucket: 'generate' });
    expect(refused).toMatchObject({ allowed: false, remaining: 0 });

    vi.advanceTimersByTime(windowMs + 1);
    const reset = await alice.mutation(api.rateLimits.consume, { bucket: 'generate' });
    expect(reset).toMatchObject({ allowed: true, remaining: limit - 1 });
  });

  test('keeps users and buckets independent', async () => {
    const t = convexTest(schema, modules);
    const { limit } = RATE_LIMITS.generate;
    for (let i = 0; i < limit; i++) {
      await t.withIdentity(ALICE).mutation(api.rateLimits.consume, { bucket: 'generate' });
    }

    const aliceOtherBucket = await t
      .withIdentity(ALICE)
      .mutation(api.rateLimits.consume, { bucket: 'transform' });
    const bobSameBucket = await t
      .withIdentity(BOB)
      .mutation(api.rateLimits.consume, { bucket: 'generate' });

    expect(aliceOtherBucket.allowed).toBe(true);
    expect(bobSameBucket.allowed).toBe(true);
  });

  test('charges repeated buckets once without creating duplicate counter rows', async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    const args = { bucket: 'generate' as const, also: ['generate' as const, 'ai-daily' as const, 'ai-daily' as const] };

    await alice.mutation(api.rateLimits.consume, args);
    const second = await alice.mutation(api.rateLimits.consume, args);
    expect(second).toMatchObject({ allowed: true, remaining: RATE_LIMITS.generate.limit - 2 });
    expect((await alice.query(api.rateLimits.getAiQuota, {})).daily.used).toBe(2);
    const rows = await t.run((ctx) => ctx.db.query('rateLimits').collect());
    expect(rows).toHaveLength(2);
  });

  test('does not charge any bucket when a quota is exhausted', async () => {
    const t = convexTest(schema, modules);
    const alice = t.withIdentity(ALICE);
    await t.run((ctx) => ctx.db.insert('rateLimits', {
      key: 'ai-daily:user_alice', count: RATE_LIMITS['ai-daily'].limit, resetAt: Date.now() + 60_000,
    }));
    expect(await alice.mutation(api.rateLimits.consume, { bucket: 'generate', also: ['ai-daily'] }))
      .toMatchObject({ allowed: false, bucket: 'ai-daily' });
    const rows = await t.run((ctx) => ctx.db.query('rateLimits').collect());
    expect(rows).toHaveLength(1);
  });
});
