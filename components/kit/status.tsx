'use client'

import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Status vocabulary.
 *
 * Every status carries a shape as well as a hue, because a colour-only
 * indicator is unreadable to a meaningful share of users and invisible in a
 * screenshot printed in grey. Live is a filled disc, pending is a ring, failed
 * is a cross, done is a check.
 */

export type Tone = 'neutral' | 'live' | 'pending' | 'warning' | 'failed' | 'info'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-[var(--muted-foreground)]',
  live: 'text-[var(--success-text)]',
  pending: 'text-[var(--muted-foreground)]',
  warning: 'text-[var(--warning-text)]',
  failed: 'text-[var(--destructive-text)]',
  info: 'text-[var(--info-text)]',
}

const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-[var(--muted-foreground)]',
  live: 'bg-[var(--success-text)]',
  pending: 'bg-transparent',
  warning: 'bg-[var(--warning-text)]',
  failed: 'bg-[var(--destructive-text)]',
  info: 'bg-[var(--info-text)]',
}

export function StatusDot({
  tone = 'neutral',
  label,
  className,
}: {
  tone?: Tone
  /** Announced text. Without it the dot is decoration and is hidden. */
  label?: string
  className?: string
}) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
      className={cn(
        'inline-block size-[7px] shrink-0 rounded-full',
        TONE_FILL[tone],
        tone === 'pending' && 'border-[1.5px] border-current',
        tone === 'pending' && TONE_TEXT[tone],
        className
      )}
    />
  )
}

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-[5px] border px-1.5 py-0.5 text-2xs font-medium leading-4',
  {
    variants: {
      tone: {
        neutral: 'border-[var(--rule)] bg-[var(--surface-2)] text-[var(--muted-foreground)]',
        live: 'border-[color-mix(in_oklab,var(--success)_35%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success-text)]',
        pending: 'border-dashed border-[var(--rule-strong)] bg-transparent text-[var(--muted-foreground)]',
        warning:
          'border-[color-mix(in_oklab,var(--warning)_35%,transparent)] bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] text-[var(--warning-text)]',
        failed:
          'border-[color-mix(in_oklab,var(--destructive)_35%,transparent)] bg-[color-mix(in_oklab,var(--destructive)_12%,transparent)] text-[var(--destructive-text)]',
        info: 'border-[color-mix(in_oklab,var(--info)_35%,transparent)] bg-[color-mix(in_oklab,var(--info)_12%,transparent)] text-[var(--info-text)]',
        signal: 'border-[color-mix(in_oklab,var(--primary)_40%,transparent)] bg-[var(--signal-wash)] text-[var(--signal-text)]',
      },
      mono: { true: 'font-mono tracking-[0.02em]' },
    },
    defaultVariants: { tone: 'neutral' },
  }
)

export function Badge({
  className,
  tone,
  mono,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone, mono }), className)} {...props} />
}

/**
 * An inline message about the surface it sits on. Not a toast, not a modal:
 * it stays put so the user can read it while fixing the thing it describes.
 */
export function Callout({
  tone = 'info',
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: Tone
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  const ring: Record<Tone, string> = {
    neutral: 'border-[var(--rule)] bg-[var(--surface-2)]',
    live: 'border-[color-mix(in_oklab,var(--success)_30%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,transparent)]',
    pending: 'border-[var(--rule)] bg-[var(--surface-2)]',
    warning:
      'border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--warning)_9%,transparent)]',
    failed:
      'border-[color-mix(in_oklab,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklab,var(--destructive)_8%,transparent)]',
    info: 'border-[color-mix(in_oklab,var(--info)_30%,transparent)] bg-[color-mix(in_oklab,var(--info)_8%,transparent)]',
  }

  return (
    <div
      role={tone === 'failed' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3', ring[tone], className)}
    >
      {icon && <span className={cn('mt-px shrink-0', TONE_TEXT[tone])}>{icon}</span>}
      <div className="min-w-0 flex-1 space-y-1">
        {title && (
          <p className={cn('text-sm font-medium', TONE_TEXT[tone])}>{title}</p>
        )}
        {children && (
          <div className="text-sm leading-relaxed text-[var(--muted-foreground)]">{children}</div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

/**
 * A placeholder shaped like the thing that is coming. Sized by the caller so
 * the real content lands in the same place, which is the whole point: a
 * centred spinner tells the user nothing about what to expect.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-hidden className={cn('shimmer rounded-md', className)} {...props} />
}

/**
 * The empty state. Teaches the surface rather than reporting absence, so it
 * takes an action and a line of instruction, not just a shrug.
 */
export function EmptyState({
  title,
  children,
  action,
  icon,
  className,
}: {
  title: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-lg border border-dashed border-[var(--rule-strong)] px-6 py-14 text-center',
        className
      )}
    >
      {icon && (
        <span className="mb-4 grid size-10 place-items-center rounded-lg border border-[var(--rule)] bg-[var(--surface-2)] text-[var(--muted-foreground)]">
          {icon}
        </span>
      )}
      <h3 className="text-md font-medium">{title}</h3>
      {children && (
        <div className="mt-1.5 max-w-[46ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
          {children}
        </div>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * Determinate progress. Only rendered when a real fraction is known; an
 * indeterminate bar that creeps forward on a timer is the fake progress the
 * product brief rules out.
 */
export function Progress({
  value,
  max = 100,
  label,
  className,
}: {
  value: number
  max?: number
  label: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]', className)}
    >
      <div
        className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-[var(--dur-3)] ease-[var(--ease-out-quint)]"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
