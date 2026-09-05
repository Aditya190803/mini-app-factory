'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Dense data readouts.
 *
 * `SpecTable` is the workhorse of this design system: a plate of labelled
 * facts, hairline-ruled, numerals aligned. It is what the product shows
 * instead of a row of decorative stat cards, because the user reading it is
 * checking a value, not being impressed by one.
 */

export type SpecRow = {
  key: string
  label: React.ReactNode
  value: React.ReactNode
  /** Right-aligned control for this row, such as copy or edit. */
  action?: React.ReactNode
  /** Renders the value in mono with aligned numerals. */
  mono?: boolean
  /** Grey the row out when the value is absent rather than hiding it. */
  muted?: boolean
}

export function SpecTable({
  rows,
  caption,
  className,
  dense,
}: {
  rows: SpecRow[]
  caption?: string
  className?: string
  dense?: boolean
}) {
  return (
    <div className={cn('overflow-hidden rounded-lg border border-[var(--rule)]', className)}>
      <table className="w-full border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.key}
              className={cn(
                index > 0 && 'border-t border-[var(--rule)]',
                'bg-[var(--surface-1)]'
              )}
            >
              <th
                scope="row"
                className={cn(
                  'w-[38%] max-w-[16rem] whitespace-nowrap px-3 text-left align-top font-normal text-[var(--muted-foreground)]',
                  dense ? 'py-1.5' : 'py-2.5'
                )}
              >
                {row.label}
              </th>
              <td
                className={cn(
                  'px-3 align-top',
                  dense ? 'py-1.5' : 'py-2.5',
                  row.mono && 'tabular font-mono text-xs',
                  row.muted && 'text-[var(--muted-foreground)]'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 break-words">{row.value}</div>
                  {row.action && <div className="shrink-0">{row.action}</div>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A single labelled fact, for when one value needs to sit inline rather than
 * in a table. Label above, value below, both aligned to the same left edge.
 */
export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="key">{label}</p>
      <p className="tabular mt-1 truncate text-lg font-medium">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">{hint}</p>}
    </div>
  )
}

/**
 * A value the user will want to paste elsewhere. Shows the text and copies it,
 * confirming in place rather than through a toast, so the confirmation appears
 * where the eye already is.
 */
export function CopyValue({
  value,
  label,
  className,
  truncate = true,
}: {
  value: string
  label?: string
  className?: string
  truncate?: boolean
}) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard can be blocked outright. The value is still on screen and
      // selectable, so there is nothing useful to say here.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ? `Copy ${label}` : `Copy ${value}`}
      className={cn(
        'group inline-flex max-w-full items-center gap-1.5 rounded-[5px] px-1 py-0.5 text-left font-mono text-xs',
        'text-[var(--foreground)] transition-colors duration-[var(--dur-1)]',
        'hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]',
        className
      )}
    >
      <span className={cn('min-w-0', truncate && 'truncate')}>{value}</span>
      <span
        aria-live="polite"
        className={cn(
          'shrink-0 text-2xs',
          copied ? 'text-[var(--success-text)]' : 'text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
        )}
      >
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  )
}

/**
 * A tabular list of things the user acts on. Rows are real list items with a
 * consistent grid, which is what keeps a dashboard from turning into a wall of
 * mismatched cards.
 */
export function RowList({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      className={cn(
        'divide-y divide-[var(--rule)] overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--surface-1)]',
        className
      )}
      {...props}
    />
  )
}

export function Row({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 transition-colors duration-[var(--dur-1)] hover:bg-[var(--surface-2)] sm:px-4',
        className
      )}
      {...props}
    />
  )
}
