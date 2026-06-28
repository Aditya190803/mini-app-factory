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

  return (
    <p className="text-[10px] font-mono text-[var(--primary)] leading-snug animate-pulse" role="status">
      {label}
    </p>
  );
}