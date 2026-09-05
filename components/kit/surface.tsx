'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Structure, not decoration.
 *
 * A `Panel` is the only box in the system. It exists when a group of things
 * genuinely needs a boundary; the rest of the time a `Rule` and some space do
 * the job for free. Panels never nest, which is checked by eye rather than by
 * code but is worth stating: a card inside a card is always a layout that
 * wanted a rule.
 */

export function Panel({
  className,
  tone = 'raised',
  ...props
}: React.ComponentProps<'div'> & { tone?: 'raised' | 'flat' | 'sunken' }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--rule)]',
        tone === 'raised' && 'bg-[var(--surface-1)] shadow-[var(--shadow-xs)]',
        tone === 'flat' && 'bg-transparent',
        tone === 'sunken' && 'bg-[var(--surface-2)]',
        className
      )}
      {...props}
    />
  )
}

export function PanelHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-[var(--rule)] px-4 py-3',
        className
      )}
    >
      <div className="min-w-0">
        <h3 className="text-md font-medium tracking-[-0.01em]">{title}</h3>
        {description && (
          <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-[var(--muted-foreground)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  )
}

export function PanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 py-3.5', className)} {...props} />
}

export function PanelFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-end gap-2 border-t border-[var(--rule)] bg-[var(--surface-2)] px-4 py-2.5',
        className
      )}
      {...props}
    />
  )
}

/** A hairline. The workhorse of the system. */
export function Rule({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical'
  className?: string
}) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-[var(--rule)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
    />
  )
}

/**
 * A titled block on a settings or docs page. The title sits on a rule with
 * dimension ticks, which is where the plate language lives without adding a
 * single extra box.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn('scroll-mt-20', className)}>
      <div className="ticked flex flex-wrap items-end justify-between gap-3 pb-2.5">
        <div className="min-w-0">
          <h2 className="text-lg font-medium tracking-[-0.018em]">{title}</h2>
          {description && (
            <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  )
}

/**
 * The horizontal strip above a working area. Fixed height so panes below it
 * line up across the app, and the height is a token so it stays that way.
 */
export function Toolbar({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-[var(--bar-h)] shrink-0 items-center gap-2 border-b border-[var(--rule)] bg-[var(--surface-1)] px-3',
        className
      )}
      {...props}
    />
  )
}

/** Pushes what follows to the far end of a flex row. */
export function Spacer() {
  return <div className="flex-1" aria-hidden />
}

/**
 * The drafting-plate backdrop. A masked grid and one breath of the accent at
 * the top edge. Deliberately restrained: it should read as paper, not as a
 * hero graphic, so it can sit under both marketing and product surfaces.
 */
export function PlateBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <div
        className="plate-grid absolute inset-0"
        style={{
          maskImage: 'radial-gradient(120% 70% at 50% 0%, black 5%, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(120% 70% at 50% 0%, black 5%, transparent 70%)',
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-64"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, color-mix(in oklab, var(--primary) 7%, transparent), transparent 72%)',
        }}
      />
    </div>
  )
}
