'use client';

import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Badge, EmptyState, Row, RowList, Section, Skeleton } from '@/components/kit';

/**
 * Recent failed runs across every project. Failed runs were stored but never shown anywhere, so
 * a provider outage or a broken deploy path was only noticed when users complained.
 */
export default function RunFailures() {
  const failures = useQuery(api.conversations.listRecentFailures, {});

  return (
    <Section
      title="Recent failed runs"
      description="The last 50 builds that failed, newest first. Set MAF_ALERT_WEBHOOK_URL on the Convex deployment to be alerted when failures spike."
    >
      {failures === undefined ? (
        <Skeleton className="h-24" />
      ) : failures.length === 0 ? (
        <EmptyState title="No failed runs">
          <p>Nothing has failed recently.</p>
        </EmptyState>
      ) : (
        <RowList>
          {failures.map((failure) => (
            <Row key={failure._id} className="flex-wrap">
              <span className="font-mono text-xs text-[var(--muted-foreground)]">
                {new Date(failure.updatedAt).toLocaleString()}
              </span>
              <span className="font-mono text-sm">{failure.projectName ?? 'deleted project'}</span>
              <Badge tone="neutral" mono>{failure.kind}</Badge>
              {failure.errorCode && <Badge tone="failed" mono>{failure.errorCode}</Badge>}
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--muted-foreground)]" title={failure.errorMessage}>
                {failure.errorMessage}
              </span>
            </Row>
          ))}
        </RowList>
      )}
    </Section>
  );
}
