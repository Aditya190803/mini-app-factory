'use client'

import * as React from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from '@/components/kit'

/**
 * The showcase.
 *
 * These are worked examples, not customers. The carousel mechanic is here
 * because a set of comparable specimens reads better one at a time than as a
 * grid, but nothing in it is presented as somebody's testimony: every card is
 * a prompt and the shape of what that prompt produces, labelled as an example.
 *
 * Scrolling is native, snapped, and keyboard reachable. The arrows nudge the
 * scroll container rather than driving an index, so a trackpad swipe and a
 * button press cannot disagree about where the carousel is.
 */

type Specimen = {
  id: string
  prompt: string
  target: 'Static site' | 'Edge app'
  files: string[]
  bindings?: string[]
  pages: number
}

const SPECIMENS: Specimen[] = [
  {
    id: 'invoices',
    prompt: 'Track freelance invoices, flag the overdue ones, chart monthly income',
    target: 'Edge app',
    files: ['index.html', 'invoices.html', 'app.js', '_worker.js', '0001_init.sql'],
    bindings: ['D1 · DB'],
    pages: 2,
  },
  {
    id: 'bike-shop',
    prompt: 'One page site for a bike repair shop with hours, prices, and a map',
    target: 'Static site',
    files: ['index.html', 'styles.css', 'map.js'],
    pages: 1,
  },
  {
    id: 'shortener',
    prompt: 'Link shortener with a dashboard showing clicks per day and per country',
    target: 'Edge app',
    files: ['index.html', 'stats.html', '_worker.js', '0001_links.sql'],
    bindings: ['D1 · DB', 'KV · CACHE'],
    pages: 2,
  },
  {
    id: 'docs',
    prompt: 'Documentation site for a small Python library with a sidebar and code samples',
    target: 'Static site',
    files: ['index.html', 'guide.html', 'api.html', 'docs.css'],
    pages: 3,
  },
  {
    id: 'reading',
    prompt: 'Paste a URL, save the title, tag it, search it later',
    target: 'Edge app',
    files: ['index.html', 'app.js', '_worker.js', '0001_items.sql'],
    bindings: ['D1 · DB', 'R2 · FILES'],
    pages: 1,
  },
]

export function Showcase({ className }: { className?: string }) {
  const track = React.useRef<HTMLUListElement>(null)

  const nudge = (direction: -1 | 1) => {
    const node = track.current
    if (!node) return
    const card = node.querySelector('li')
    const step = card ? card.getBoundingClientRect().width + 16 : node.clientWidth * 0.8
    node.scrollBy({ left: step * direction, behavior: 'smooth' })
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="mx-auto flex w-full max-w-[84rem] flex-wrap items-end justify-between gap-4 px-4 sm:px-6">
        <div>
          <h2 className="display-lg">What comes out</h2>
          <p className="mt-4 max-w-[52ch] text-md leading-relaxed text-[var(--muted-foreground)]">
            Worked examples. Each one is a prompt and the file set it produces, so you can see where
            the line between a static site and an edge app actually falls.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton label="Previous example" intent="default" onClick={() => nudge(-1)}>
            <ArrowLeft className="size-4" />
          </IconButton>
          <IconButton label="Next example" intent="default" onClick={() => nudge(1)}>
            <ArrowRight className="size-4" />
          </IconButton>
        </div>
      </div>

      <ul
        ref={track}
        className="scroll-thin mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 sm:px-6"
        style={{ scrollPaddingInline: '1.5rem' }}
      >
        {SPECIMENS.map((specimen) => {
          const isEdge = specimen.target === 'Edge app'
          return (
            <li
              key={specimen.id}
              className="flex w-[min(22rem,82vw)] shrink-0 snap-start flex-col justify-between rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-1)] p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      'rounded-[4px] border px-1.5 py-px font-mono text-[10px]',
                      isEdge
                        ? 'border-[color-mix(in_oklab,var(--primary)_40%,transparent)] bg-[var(--signal-wash)] text-[var(--signal-text)]'
                        : 'border-[var(--rule)] bg-[var(--surface-2)] text-[var(--muted-foreground)]'
                    )}
                  >
                    {specimen.target.toLowerCase()}
                  </span>
                  <span className="tabular font-mono text-[10px] text-[var(--muted-foreground)]">
                    {specimen.pages} page{specimen.pages === 1 ? '' : 's'}
                  </span>
                </div>

                <p className="mt-4 text-md leading-relaxed text-[var(--foreground)]">
                  {specimen.prompt}
                </p>
              </div>

              <div className="mt-6 border-t border-[var(--rule)] pt-3">
                <p className="key">Files</p>
                <ul className="mt-2 space-y-1">
                  {specimen.files.map((file) => (
                    <li
                      key={file}
                      className="flex items-center gap-2 font-mono text-[11px] text-[var(--muted-foreground)]"
                    >
                      <span
                        className={cn(
                          'inline-block h-2.5 w-[3px] rounded-[1px]',
                          file.endsWith('.sql') || file === '_worker.js'
                            ? 'bg-[var(--signal-text)]'
                            : 'bg-[var(--rule-strong)]'
                        )}
                      />
                      {file}
                    </li>
                  ))}
                </ul>

                {specimen.bindings && (
                  <p className="mt-3 font-mono text-[10px] text-[var(--muted-foreground)]">
                    {specimen.bindings.join('   ')}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
