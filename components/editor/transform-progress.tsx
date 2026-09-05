'use client';

import type { TransformStreamEvent } from '@/lib/transform-stream';

export type TransformProgressState = {
  stage: 'planning' | 'generating' | 'applying' | 'saving' | null;
  message?: string;
  applying?: { index: number; total: number; tool: string; path?: string };
};

export function transformEventToProgress(event: TransformStreamEvent): TransformProgressState | null {
  if (event.status === 'planning') {
    return { stage: 'planning', message: event.message || event.editType };
  }
  if (event.status === 'generating') {
    return { stage: 'generating', message: event.message };
  }
  if (event.status === 'applying') {
    return {
      stage: 'applying',
      applying: { index: event.index, total: event.total, tool: event.tool, path: event.path },
    };
  }
  if (event.status === 'saving') {
    return { stage: 'saving', message: event.message };
  }
  return null;
}

export default function TransformProgress({ state }: { state: TransformProgressState | null }) {
  if (!state?.stage) return null;

  const label =
    state.stage === 'applying' && state.applying
      ? `Applying ${state.applying.tool}${state.applying.path ? ` → ${state.applying.path}` : ''} (${state.applying.index}/${state.applying.total})`
      : state.stage === 'planning'
        ? `Planning: ${state.message || '…'}`
        : state.stage === 'generating'
          ? state.message || 'Generating changes…'
          : state.message || 'Saving…';

  const applying = state.stage === 'applying' ? state.applying : undefined;
  const pct =
    applying && applying.total > 0
      ? Math.round((applying.index / applying.total) * 100)
      : null;

  return (
    <div className="mt-2 space-y-1.5" role="status" aria-live="polite">
      <p className="truncate text-xs leading-snug text-muted-foreground" title={label}>
        {label}
      </p>
      {/* Determinate only when the stream actually reports index/total;
          otherwise an indeterminate track, never a fake percentage. */}
      {pct !== null ? (
        <div
          className="h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Applying changes"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
        </div>
      )}
    </div>
  );
}