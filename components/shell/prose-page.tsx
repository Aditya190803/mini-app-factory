import * as React from 'react'
import Link from 'next/link'
import { Wordmark } from '@/components/brand/mark'
import { Rule } from '@/components/kit'

/**
 * The document shell for legal and reference pages.
 *
 * Prose measure is capped at 68ch and the running heads are set in the mono
 * face, which is what ties these pages to the rest of the brand without
 * turning a privacy policy into a landing page.
 */
export function ProsePage({
  title,
  subtitle,
  updated,
  children,
  toc,
}: {
  title: string
  subtitle?: string
  /** Written out in full. A bare ISO date in a legal document is unfriendly. */
  updated?: string
  children: React.ReactNode
  toc?: ReadonlyArray<{ id: string; label: string }>
}) {
  return (
    <>
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--rule)] bg-[var(--background)]">
        <div className="mx-auto flex h-[var(--bar-h)] w-full max-w-[84rem] items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <Wordmark />
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md px-2.5 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            Projects
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[84rem] px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
          <div className="min-w-0">
            <h1 className="display-lg">{title}</h1>
            {subtitle && (
              <p className="mt-4 max-w-[62ch] text-md leading-relaxed text-[var(--muted-foreground)]">
                {subtitle}
              </p>
            )}
            {updated && (
              <p className="key mt-5">Last updated {updated}</p>
            )}

            <Rule className="my-8" />

            <div className="prose-plate max-w-[68ch]">{children}</div>
          </div>

          {toc && toc.length > 0 && (
            <nav aria-label="On this page" className="hidden lg:block">
              <div className="sticky top-24">
                <p className="key">On this page</p>
                <ul className="mt-3 space-y-1.5 border-l border-[var(--rule)]">
                  {toc.map((entry) => (
                    <li key={entry.id}>
                      <a
                        href={`#${entry.id}`}
                        className="-ml-px block border-l border-transparent pl-3 text-sm text-[var(--muted-foreground)] transition-colors hover:border-[var(--rule-strong)] hover:text-[var(--foreground)]"
                      >
                        {entry.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </nav>
          )}
        </div>
      </main>
    </>
  )
}

/** A titled block inside a ProsePage. */
export function ProseSection({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-[var(--rule)] py-8 first:border-t-0 first:pt-0">
      <h2 className="display-md">{title}</h2>
      <div className="mt-4 space-y-4 text-md leading-[1.7] text-[var(--muted-foreground)] [&_a]:text-[var(--signal-text)] [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded-[4px] [&_code]:border [&_code]:border-[var(--rule)] [&_code]:bg-[var(--surface-2)] [&_code]:px-1 [&_code]:py-px [&_code]:text-[0.85em] [&_strong]:font-medium [&_strong]:text-[var(--foreground)]">
        {children}
      </div>
    </section>
  )
}
