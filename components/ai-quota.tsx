'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Callout, Progress, Skeleton } from '@/components/kit';

function resetsIn(resetAt: number | null) {
  if (!resetAt) return null;
  const hours = Math.max(1, Math.round((resetAt - Date.now()) / 3_600_000));
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * How much of the shared AI allowance the user has left. Quotas were invisible: the first sign
 * of one was a failed build. Requests made with the user's own key do not count against it.
 */
export function AiQuota({ hasOwnKey }: { hasOwnKey: boolean }) {
  const quota = useQuery(api.rateLimits.getAiQuota, {});
  if (quota === undefined) return <Skeleton className="h-16" />;

  const rows = [
    { label: 'Today', ...quota.daily },
    { label: 'This month', ...quota.monthly },
  ];
  const exhausted = rows.find((row) => row.used >= row.limit);

  return (
    <div className="space-y-3">
      {hasOwnKey ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Builds run on your own key, so they do not use the shared allowance below.
        </p>
      ) : exhausted ? (
        <Callout tone="warning" title={`You have used ${exhausted.label === 'Today' ? "today's" : "this month's"} shared allowance`}>
          Add your own API key below to keep building now, or wait {resetsIn(exhausted.resetAt) ?? 'for the reset'}.
        </Callout>
      ) : null}
      {rows.map((row) => (
        <div key={row.label} className="space-y-1">
          <div className="flex items-baseline justify-between text-sm">
            <span>{row.label}</span>
            <span className="tabular text-[var(--muted-foreground)]">
              {row.used} of {row.limit} builds
              {row.resetAt ? ` · resets in ${resetsIn(row.resetAt)}` : ''}
            </span>
          </div>
          <Progress value={row.used} max={row.limit} label={`${row.label}: ${row.used} of ${row.limit} AI builds used`} />
        </div>
      ))}
    </div>
  );
}
