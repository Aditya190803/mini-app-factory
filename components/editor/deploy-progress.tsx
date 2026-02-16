'use client';

import { cn } from '@/lib/utils';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

/** Known deploy pipeline steps derived from the deploy API route progress messages. */
const DEPLOY_STEPS = [
  { key: 'prepare', label: 'Preparing repository', match: /preparing repository/i },
  { key: 'github-user', label: 'Fetching GitHub user', match: /fetching user/i },
  { key: 'github-check', label: 'Checking repository', match: /checking repository/i },
  { key: 'github-create', label: 'Creating repository', match: /creating repository/i },
  { key: 'github-push', label: 'Pushing files', match: /pushing|uploading|generating readme/i },
  { key: 'netlify-keys', label: 'Configuring deploy keys', match: /deploy keys/i },
  { key: 'netlify-webhook', label: 'Setting up webhook', match: /webhook/i },
  { key: 'netlify-site', label: 'Creating Netlify site', match: /creating site/i },
] as const;

interface DeployProgressIndicatorProps {
  /** Current status message from the deploy stream */
  statusMessage: string | null;
  /** Whether deployment is in progress */
  isDeploying: boolean;
  /** Deploy mode to filter relevant steps */
  deployOption: 'github-netlify' | 'github-only' | 'maf-hosted';
}

function getActiveStepIndex(statusMessage: string | null): number {
  if (!statusMessage) return -1;
  for (let i = DEPLOY_STEPS.length - 1; i >= 0; i--) {
    if (DEPLOY_STEPS[i].match.test(statusMessage)) return i;
  }
  return -1;
}

export function DeployProgressIndicator({ statusMessage, isDeploying, deployOption }: DeployProgressIndicatorProps) {
  if (!isDeploying) return null;

  // Filter steps based on deploy mode
  const relevantSteps = DEPLOY_STEPS.filter((step) => {
    if (deployOption === 'github-only') {
      return !step.key.startsWith('netlify');
    }
    if (deployOption === 'maf-hosted') {
      return step.key === 'prepare';
    }
    return true;
  });

  const activeIndex = getActiveStepIndex(statusMessage);

  return (
    <div className="p-3 border border-[var(--border)] rounded-md bg-[var(--background-overlay)]/30 space-y-1 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-2 w-2 bg-[var(--primary)] rounded-full animate-pulse" />
        <span className="text-[10px] font-mono uppercase font-bold text-[var(--secondary-text)] tracking-wider">
          Deployment Progress
        </span>
      </div>
      <div className="space-y-1 pl-1">
        {relevantSteps.map((step) => {
          const globalIdx = DEPLOY_STEPS.findIndex((s) => s.key === step.key);
          const isCompleted = activeIndex > globalIdx;
          const isActive = activeIndex === globalIdx;
          const isPending = activeIndex < globalIdx;

          return (
            <div
              key={step.key}
              className={cn(
                'flex items-center gap-2 py-0.5 transition-colors duration-300',
                isCompleted && 'text-[var(--success)]',
                isActive && 'text-[var(--primary)]',
                isPending && 'text-[var(--muted-text)] opacity-40'
              )}
            >
              {isCompleted ? (
                <CheckCircle2 size={12} />
              ) : isActive ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Circle size={12} />
              )}
              <span className="text-[11px] font-mono">{step.label}</span>
            </div>
          );
        })}
      </div>
      {statusMessage && (
        <div className="text-[10px] font-mono text-[var(--muted-text)] mt-2 pl-4 border-l-2 border-[var(--primary)]/30 py-0.5 truncate">
          {statusMessage}
        </div>
      )}
    </div>
  );
}
