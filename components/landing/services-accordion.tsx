'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The horizontal accordion.
 *
 * Vertical slices that open sideways. Two rules keep it from being the usual
 * hover-only trick: the open slice is real state, so a click and a keyboard
 * focus open it exactly as hover does; and every slice's text stays in the
 * document, only clipped, so a screen reader and a text search both find it.
 *
 * Below the breakpoint it becomes a stack, because a 96px-wide column of
 * rotated text is not a mobile interface.
 */

type Slice = {
  id: string
  name: string
  binding: string
  role: string
  detail: string
  /** Only present when the service is billable beyond a free allowance. */
  note?: string
}

const SLICES: Slice[] = [
  {
    id: 'pages',
    name: 'Pages',
    binding: 'assets',
    role: 'Serves the built site',
    detail:
      'Every project ends up here, static or not. The HTML, CSS, and browser JavaScript are uploaded as a plain asset bundle to a Pages project in your own account.',
  },
  {
    id: 'workers',
    name: 'Workers',
    binding: '_worker.js',
    role: 'Runs the backend',
    detail:
      'An edge app gets a single Worker entry point in front of the assets. It handles the API routes, reads the bindings, and runs in every Cloudflare location rather than in one region.',
  },
  {
    id: 'd1',
    name: 'D1',
    binding: 'env.DB',
    role: 'Stores the data',
    detail:
      'SQLite at the edge. Schema changes arrive as ordered SQL migrations in the repo, applied in sequence, and a migration that has already run cannot be edited after the fact.',
    note: 'Created on first deploy, after you confirm it.',
  },
  {
    id: 'kv',
    name: 'KV',
    binding: 'env.CACHE',
    role: 'Caches reads',
    detail:
      'Key-value storage for the things that are read constantly and written rarely: session lookups, rendered fragments, feature flags.',
  },
  {
    id: 'r2',
    name: 'R2',
    binding: 'env.FILES',
    role: 'Holds uploads',
    detail:
      'Object storage for anything a user uploads. No charge for reading the data back out, which is the difference that usually decides where files live.',
    note: 'Created on first deploy, after you confirm it.',
  },
  {
    id: 'queues',
    name: 'Queues',
    binding: 'env.JOBS',
    role: 'Defers work',
    detail:
      'Work that should not block a response: sending mail, resizing an image, calling a slow third party. Producers and consumers are both declared in the manifest.',
  },
]

export function ServicesAccordion({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(0)

  return (
    <div className={cn('w-full', className)}>
      {/* Wide: slices */}
      <div className="hidden overflow-hidden rounded-xl border border-[var(--rule-strong)] lg:flex lg:h-[26rem]">
        {SLICES.map((slice, index) => {
          const active = index === open
          return (
            <button
              key={slice.id}
              type="button"
              aria-expanded={active}
              onMouseEnter={() => setOpen(index)}
              onFocus={() => setOpen(index)}
              onClick={() => setOpen(index)}
              className={cn(
                'group relative flex min-w-0 items-stretch overflow-hidden text-left',
                'border-r border-[var(--rule)] last:border-r-0',
                'transition-[flex-grow,background-color] duration-500 ease-[var(--ease-out-quint)]',
                'focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[var(--ring)]',
                active
                  ? 'flex-[4] bg-[var(--surface-1)]'
                  : 'flex-[0.6] bg-[var(--surface-2)] hover:bg-[var(--surface-3)]'
              )}
            >
              {/* The spine: name reading upward, always visible. */}
              <span className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-[var(--rule)] py-4">
                <span className="tabular font-mono text-[10px] text-[var(--rule-strong)]">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span
                  className={cn(
                    'font-mono text-sm tracking-[-0.02em] transition-colors duration-300',
                    active ? 'text-[var(--signal-text)]' : 'text-[var(--muted-foreground)]'
                  )}
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                >
                  {slice.name}
                </span>
                <span
                  className={cn(
                    'size-1.5 rounded-full transition-colors duration-300',
                    active ? 'bg-[var(--signal-text)]' : 'bg-[var(--rule-strong)]'
                  )}
                />
              </span>

              {/* The panel. Clipped rather than removed. */}
              <span
                className={cn(
                  'flex min-w-[22rem] flex-col justify-between p-6 transition-opacity duration-500',
                  active ? 'opacity-100 delay-100' : 'opacity-0'
                )}
              >
                <span className="block">
                  <span className="key block">{slice.role}</span>
                  <span className="mt-3 block font-mono text-3xl tracking-[-0.045em] text-[var(--foreground)]">
                    {slice.name}
                  </span>
                  <span className="mt-4 block max-w-[42ch] text-md leading-relaxed text-[var(--muted-foreground)]">
                    {slice.detail}
                  </span>
                </span>

                <span className="mt-6 block border-t border-[var(--rule)] pt-3">
                  <span className="flex items-baseline justify-between gap-4">
                    <code className="font-mono text-xs text-[var(--signal-text)]">{slice.binding}</code>
                    {slice.note && (
                      <span className="text-right text-xs text-[var(--muted-foreground)]">{slice.note}</span>
                    )}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Narrow: a stack of the same facts */}
      <ul className="divide-y divide-[var(--rule)] overflow-hidden rounded-xl border border-[var(--rule-strong)] lg:hidden">
        {SLICES.map((slice) => (
          <li key={slice.id} className="bg-[var(--surface-1)] p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-mono text-lg tracking-[-0.04em]">{slice.name}</h3>
              <code className="shrink-0 font-mono text-xs text-[var(--signal-text)]">{slice.binding}</code>
            </div>
            <p className="key mt-1">{slice.role}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">{slice.detail}</p>
            {slice.note && (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">{slice.note}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
