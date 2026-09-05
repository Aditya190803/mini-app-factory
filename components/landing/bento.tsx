import * as React from 'react'
import { cn } from '@/lib/utils'
import { CAPABILITY_SPECS } from '@/lib/constants'
import { TARGETS } from '@/lib/targets'

/**
 * The bento.
 *
 * A 6 by 3 lattice, fully tiled. The spans have to add up: A(4x2) + B(2x2)
 * fills rows one and two at twelve cells, and C(6x1) fills row three at six.
 * Eighteen cells, three cards, no gaps. grid-flow-dense is on so a browser
 * that disagrees about a span back-fills rather than leaving a hole.
 *
 * Three cards, not five. This is the only explanatory block on the page now,
 * so it carries the idea (two shapes), the proof it is not a black box (a real
 * manifest), and the specifics. Everything past that was repetition.
 */
export function Bento({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-flow-dense grid-cols-1 overflow-hidden rounded-xl border border-[var(--rule-strong)]',
        'lg:grid-cols-6 lg:grid-rows-[repeat(2,minmax(10rem,auto))_minmax(6rem,auto)]',
        className
      )}
    >
      {/* A: cols 1-4, rows 1-2 */}
      <Cell className="lg:col-span-4 lg:row-span-2">
        <p className="key">Two shapes, one host</p>
        <div className="mt-4 grid gap-px bg-[var(--rule)] sm:grid-cols-2">
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
        <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
          The target is read off the files rather than set as a mode you have to remember. A project
          that grows a Worker mid-conversation becomes an edge app on the spot.
        </p>
      </Cell>

      {/* B: cols 5-6, rows 1-2 */}
      <Cell className="lg:col-span-2 lg:row-span-2">
        <p className="key">The manifest</p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
          Bindings are declared in a file you can read and edit, not hidden in a dashboard. Nothing
          in it is created until you approve the exact list.
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
      </Cell>

      {/* C: cols 1-6, row 3 */}
      <Cell className="lg:col-span-6">
        <p className="key">What you get, exactly</p>
        <dl className="mt-3 grid gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITY_SPECS.map((spec) => (
            <div key={spec.key} className="flex gap-3 border-b border-[var(--rule)] py-1.5 text-xs">
              <dt className="w-16 shrink-0 font-mono uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                {spec.key}
              </dt>
              <dd className="min-w-0 leading-relaxed text-[var(--foreground)]">{spec.value}</dd>
            </div>
          ))}
        </dl>
      </Cell>
    </div>
  )
}

function Cell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'border-b border-[var(--rule)] bg-[var(--surface-1)] p-5 last:border-b-0 sm:p-6 lg:border-r lg:[&:nth-child(2)]:border-r-0 lg:[&:nth-child(3)]:border-b-0 lg:[&:nth-child(3)]:border-r-0',
        className
      )}
    >
      {children}
    </div>
  )
}
