import { v } from 'convex/values';
import { internalAction, internalQuery } from './_generated/server';
import { internal } from './_generated/api';

/**
 * Failure alerting. Every run failure is stored, but nothing watched them; this cron posts to a
 * webhook when failures spike, which is what a provider outage or a broken deploy path looks like.
 *
 * Configure on the Convex deployment:
 *   npx convex env set MAF_ALERT_WEBHOOK_URL https://hooks.slack.com/...
 *   npx convex env set MAF_ALERT_FAILURE_THRESHOLD 5   # optional, per window
 */
export const ALERT_WINDOW_MS = 15 * 60 * 1000;

export const countRecentFailures = internalQuery({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const failed = await ctx.db
      .query('generationRuns')
      .withIndex('by_status_time', (q) => q.eq('status', 'failed').gt('updatedAt', since))
      .take(500);
    const byCode = new Map<string, number>();
    for (const run of failed) byCode.set(run.errorCode ?? 'UNKNOWN', (byCode.get(run.errorCode ?? 'UNKNOWN') ?? 0) + 1);
    return { total: failed.length, byCode: [...byCode.entries()].sort((a, b) => b[1] - a[1]) };
  },
});

type AlertResult = { sent: boolean; total?: number; reason?: string };

export const alertOnFailureSpike = internalAction({
  args: {},
  // Explicit types break the inference cycle of calling this module's own query through `internal`.
  handler: async (ctx): Promise<AlertResult> => {
    const url = process.env.MAF_ALERT_WEBHOOK_URL?.trim();
    if (!url) return { sent: false, reason: 'MAF_ALERT_WEBHOOK_URL is not set' };
    const threshold = Number(process.env.MAF_ALERT_FAILURE_THRESHOLD) || 5;
    const { total, byCode }: { total: number; byCode: Array<[string, number]> } = await ctx.runQuery(
      internal.alerts.countRecentFailures,
      { since: Date.now() - ALERT_WINDOW_MS }
    );
    if (total < threshold) return { sent: false, total };
    const breakdown = byCode.slice(0, 5).map(([code, count]) => `${code} ×${count}`).join(', ');
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Mini App Factory: ${total} runs failed in the last 15 minutes (${breakdown}). See /admin.` }),
    });
    return { sent: true, total };
  },
});
