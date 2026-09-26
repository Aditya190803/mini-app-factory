'use client'

import type { TransformStreamEvent } from '@/lib/transform-stream'
import { Progress } from '@/components/kit'

export type TransformProgressState = {
  stage: 'planning' | 'generating' | 'applying' | 'saving' | null
  message?: string
  applying?: { index: number; total: number; tool: string; path?: string }
}

export function transformEventToProgress(event: TransformStreamEvent): TransformProgressState | null {
  if (event.status === 'planning') return { stage: 'planning', message: event.message || event.editType }
  if (event.status === 'generating') return { stage: 'generating', message: event.message }
  if (event.status === 'applying') {
    return {
      stage: 'applying',
      applying: { index: event.index, total: event.total, tool: event.tool, path: event.path },
    }
  }
  if (event.status === 'saving') return { stage: 'saving', message: event.message }
  return null
}

/**
 * Run progress.
 *
 * A bar appears only when the stream reports a real index out of a real total.
 * Every other stage gets a line of text and nothing else, because a bar that
 * creeps forward on a timer is a claim about progress the run has not made.
 */
export default function TransformProgress({ state }: { state: TransformProgressState | null }) {
  if (!state?.stage) return null

  const applying = state.stage === 'applying' ? state.applying : undefined

  const label = applying
    ? `${applying.tool}${applying.path ? ` on ${applying.path}` : ''}`
    : state.stage === 'planning'
      ? `Planning. ${state.message || ''}`.trim()
      : state.stage === 'generating'
        ? state.message || 'Writing changes'
        : state.message || 'Saving'

  return (
    <div className="mt-2.5 space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-[var(--muted-foreground)]" title={label}>
          {label}
        </p>
        {applying && applying.total > 0 && (
          <p className="tabular shrink-0 font-mono text-[10px] text-[var(--muted-foreground)]">
            {applying.index}/{applying.total}
          </p>
        )}
      </div>
      {applying && applying.total > 0 && (
        <Progress
          label="Applying changes"
          value={applying.index}
          max={applying.total}
        />
      )}
    </div>
  )
}
