import * as React from 'react'
import { cn } from '@/lib/utils'
import { CAPABILITY_SPECS } from '@/lib/constants'
import { TARGETS } from '@/lib/targets'

/**
 * The bento.
 *
 * A 6 by 4 lattice, fully tiled. The spans are fixed rather than flowed
 * because the arithmetic has to hold: A(4x2) + B(2x2) fills rows one and two
 * at twelve cells, and C(2x2) + D(4x1) + E(4x1) fills rows three and four at
 * the same. Twenty four cells, five cards, no gaps.
 *
 * grid-flow-dense is on so a browser that disagrees about a span still
 * back-fills rather than leaving a hole.
 *
 * The cards are deliberately unlike each other. Five identical icon-heading-
 * paragraph tiles is the pattern this is avoiding, so one card is a comparison,
 * one is a code listing, one is a spec table, one is a strip of numbers.
 */
export function Bento({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-flow-dense grid-cols-2 overflow-hidden rounded-xl border border-[var(--rule-strong)]',
        'lg:grid-cols-6 lg:grid-rows-[repeat(2,minmax(11rem,auto))_repeat(2,minmax(8rem,auto))]',
        className
      )}
    >
      {/* A: cols 1-4, rows 1-2 */}
      <Cell className="col-span-2 lg:col-span-4 lg:row-span-2">
        <p className="key">Two shapes, one host</p>
        <div className="mt-5 grid gap-px bg-[var(--rule)] sm:grid-cols-2">
          {(['static', 'edge'] as const).map((id) => {
            const spec = TARGETS[id]
            return (
              <div key={id} className="bg-[var(--surface-1)] p-4">
                <h3 className="font-mono text-xl tracking-[-0.045em]">{spec.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                  {spec.summary}
                </p>
                <dl className="mt-4 space-y-2 border-t border-[var(--rule)] pt-3 text-xs">
                  <div>
                    <dt className="key">Runs on</dt>
                    <dd className="mt-0.5 text-[var(--foreground)]">{spec.runtime}</dd>
                  </div>
                  <div>
                    <dt className="key">Creates</dt>
                    <dd className="mt-0.5 leading-relaxed text-[var(--muted-foreground)]">
                      {spec.provisions}
                    </dd>
                  </div>
                </dl>
              </div>
            )
          })}
        </div>
        <p className="mt-5 max-w-[62ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
          The target is read off the files rather than set as a mode you have to remember. A project
          that grows a Worker mid-conversation becomes an edge app on the spot.
        </p>
      </Cell>

      {/* B: cols 5-6, rows 1-2 */}
      <Cell className="col-span-2 lg:row-span-2">
        <p className="key">The manifest</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Bindings are declared in a file you can read and edit, not hidden in a dashboard.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-[var(--rule)] bg-[var(--background)] p-3 font-mono text-[11px] leading-[1.6] text-[var(--muted-foreground)]">
{`{
  "version": 1,
  "bindings": {
    "d1": [
      { "binding": "DB",
        "name": "invoices" }
    ],
    "r2": [
      { "binding": "FILES",
        "name": "uploads" }
    ]
  }
}`}
        </pre>
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Nothing in it is created until you approve the exact list.
        </p>
      </Cell>

      {/* C: cols 1-2, rows 3-4 */}
      <Cell className="col-span-2 lg:row-span-2">
        <p className="key">Migrations</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Schema changes are ordered SQL files. One that has already run cannot be edited after the
          fact, and a destructive one is refused.
        </p>
        <ul className="mt-4 space-y-1.5 font-mono text-[11px]">
          {[
            ['0001_init.sql', 'applied'],
            ['0002_add_client.sql', 'applied'],
            ['0003_index_due.sql', 'pending'],
          ].map(([file, state]) => (
            <li key={file} className="flex items-center justify-between gap-3">
              <span className="truncate text-[var(--foreground)]">{file}</span>
              <span
                className={cn(
                  'shrink-0',
                  state === 'applied' ? 'text-[var(--success-text)]' : 'text-[var(--muted-foreground)]'
                )}
              >
                {state}
              </span>
            </li>
          ))}
        </ul>
      </Cell>

      {/* D: cols 3-6, row 3 */}
      <Cell className="col-span-2 lg:col-span-4">
        <p className="key">What you get, exactly</p>
        <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {CAPABILITY_SPECS.slice(0, 4).map((spec) => (
            <div key={spec.key} className="flex gap-3 border-b border-[var(--rule)] py-1.5 text-xs">
              <dt className="w-16 shrink-0 font-mono uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                {spec.key}
              </dt>
              <dd className="min-w-0 leading-relaxed text-[var(--foreground)]">{spec.value}</dd>
            </div>
          ))}
        </dl>
      </Cell>

      {/* E: cols 3-6, row 4 */}
      <Cell className="col-span-2 lg:col-span-4">
        <div className="flex h-full flex-wrap items-center gap-x-10 gap-y-4">
          {[
            ['Recoverable', 'Every successful build is kept as a restorable version'],
            ['Portable', 'The same bundle downloads as a zip or pushes to your own repo'],
            ['Yours', 'Deployed into your Cloudflare account, not into ours'],
          ].map(([title, body]) => (
            <div key={title} className="min-w-[13rem] flex-1">
              <p className="font-mono text-md tracking-[-0.03em] text-[var(--foreground)]">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">{body}</p>
            </div>
          ))}
        </div>
      </Cell>
    </div>
  )
}

function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'border-b border-r border-[var(--rule)] bg-[var(--surface-1)] p-5 last:border-b-0 sm:p-6',
        className
      )}
    >
      {children}
    </div>
  )
}
