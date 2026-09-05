'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The hero's floating object.
 *
 * Deliberately not a photograph. What this product makes is a file tree and a
 * Worker, so the hero shows a file tree and a Worker. It reads as an artifact
 * rather than a screenshot because it is set on the plate grid at a slight
 * angle, and it is the one place the accent appears at any size.
 *
 * Presentational and inert. Hidden from assistive technology, because
 * everything it says is said in the copy beside it.
 */

const TREE: Array<{ depth: number; name: string; kind: 'dir' | 'page' | 'style' | 'script' | 'worker' | 'sql' | 'config' }> = [
  { depth: 0, name: 'index.html', kind: 'page' },
  { depth: 0, name: 'invoices.html', kind: 'page' },
  { depth: 0, name: 'styles.css', kind: 'style' },
  { depth: 0, name: 'app.js', kind: 'script' },
  { depth: 0, name: '_worker.js', kind: 'worker' },
  { depth: 0, name: 'migrations', kind: 'dir' },
  { depth: 1, name: '0001_init.sql', kind: 'sql' },
  { depth: 0, name: 'cloudflare.manifest.json', kind: 'config' },
]

const KIND_LABEL: Record<string, string> = {
  page: 'html',
  style: 'css',
  script: 'js',
  worker: 'worker',
  sql: 'sql',
  config: 'json',
  dir: '',
}

const CODE = [
  { t: 'export default {', c: 'plain' },
  { t: '  async fetch(request, env) {', c: 'plain' },
  { t: '    const { results } = await env.DB', c: 'plain' },
  { t: "      .prepare('select * from invoices where due < ?')", c: 'string' },
  { t: '      .bind(Date.now())', c: 'plain' },
  { t: '      .all()', c: 'plain' },
  { t: '    return Response.json(results)', c: 'plain' },
  { t: '  },', c: 'plain' },
  { t: '}', c: 'plain' },
] as const

export function HeroArtifact({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative select-none', className)}>
      {/* The plate itself */}
      <div className="overflow-hidden rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-1)] shadow-[var(--shadow-lg)]">
        <div className="flex items-center gap-2 border-b border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2">
          <span className="size-[7px] rounded-full bg-[var(--signal-text)]" />
          <span className="font-mono text-[11px] tracking-[-0.02em] text-[var(--muted-foreground)]">
            freelance-invoices-4k2m
          </span>
          <span className="ml-auto rounded-[4px] border border-[color-mix(in_oklab,var(--primary)_40%,transparent)] bg-[var(--signal-wash)] px-1.5 py-px font-mono text-[10px] text-[var(--signal-text)]">
            edge app
          </span>
        </div>

        <div className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)]">
          <div className="border-r border-[var(--rule)] py-2">
            {TREE.map((node) => (
              <div
                key={node.name}
                className="flex items-center gap-1.5 px-3 py-[3px] font-mono text-[11px] leading-4"
                style={{ paddingLeft: `${0.75 + node.depth * 0.75}rem` }}
              >
                <span
                  className={cn(
                    'inline-block h-2.5 w-[3px] shrink-0 rounded-[1px]',
                    node.kind === 'worker' || node.kind === 'sql' || node.kind === 'config'
                      ? 'bg-[var(--signal-text)]'
                      : node.kind === 'dir'
                        ? 'bg-transparent'
                        : 'bg-[var(--rule-strong)]'
                  )}
                />
                <span
                  className={cn(
                    'truncate',
                    node.kind === 'dir'
                      ? 'text-[var(--muted-foreground)]'
                      : 'text-[var(--foreground)]'
                  )}
                >
                  {node.name}
                </span>
                {KIND_LABEL[node.kind] && (
                  <span className="ml-auto shrink-0 text-[9px] text-[var(--muted-foreground)]">
                    {KIND_LABEL[node.kind]}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="min-w-0 py-2.5">
            {CODE.map((line, index) => (
              <div key={index} className="flex gap-3 px-3 leading-[1.45]">
                <span className="tabular w-4 shrink-0 select-none text-right font-mono text-[10px] text-[var(--rule-strong)]">
                  {index + 1}
                </span>
                <code
                  className={cn(
                    'truncate font-mono text-[11px]',
                    line.c === 'string' ? 'text-[var(--signal-text)]' : 'text-[var(--foreground)]'
                  )}
                >
                  {line.t}
                </code>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--rule)] bg-[var(--surface-2)] px-3 py-2 font-mono text-[10px] text-[var(--muted-foreground)]">
          <span>D1 · DB</span>
          <span>KV · CACHE</span>
          <span>R2 · FILES</span>
          <span className="ml-auto text-[var(--success-text)]">deployed</span>
        </div>
      </div>

      {/* The tag that overlaps the plate's lower edge. One accent moment. */}
      <div className="absolute -bottom-3 left-6 rounded-md border border-[var(--rule-strong)] bg-[var(--background)] px-2.5 py-1 font-mono text-[10px] tracking-[0.06em] text-[var(--muted-foreground)] shadow-[var(--shadow-sm)]">
        8 FILES · 1 WORKER · 1 DATABASE
      </div>
    </div>
  )
}
