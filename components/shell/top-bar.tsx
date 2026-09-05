'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Wordmark } from '@/components/brand/mark'
import { Rule } from '@/components/kit'

/**
 * The product top bar.
 *
 * Solid, hairline-ruled, and opaque. It used to be a blurred translucent strip;
 * that reads as glass, which the brief rules out and which makes text sitting
 * behind it hard to read while scrolling. A rule does the same separating job
 * for nothing.
 */
export function TopBar({
  children,
  crumbs,
  className,
}: {
  children?: React.ReactNode
  /** Path back to context. The last entry is the current page and is not a link. */
  crumbs?: ReadonlyArray<{ label: string; href?: string }>
  className?: string
}) {
  return (
    <header
      className={cn(
        'sticky top-0 z-[var(--z-sticky)] border-b border-[var(--rule)] bg-[var(--background)]',
        className
      )}
    >
      <div className="mx-auto flex h-[var(--bar-h)] w-full max-w-[84rem] items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Factory home"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          <Wordmark />
        </Link>

        {crumbs && crumbs.length > 0 && (
          <>
            <Rule orientation="vertical" className="hidden h-4 sm:block" />
            <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
              <ol className="flex min-w-0 items-center gap-1.5 text-sm">
                {crumbs.map((crumb, index) => {
                  const last = index === crumbs.length - 1
                  return (
                    <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
                      {index > 0 && (
                        <span aria-hidden className="text-[var(--rule-strong)]">
                          /
                        </span>
                      )}
                      {last || !crumb.href ? (
                        <span
                          aria-current={last ? 'page' : undefined}
                          className="truncate font-medium text-[var(--foreground)]"
                        >
                          {crumb.label}
                        </span>
                      ) : (
                        <Link
                          href={crumb.href}
                          className="truncate rounded text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                        >
                          {crumb.label}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ol>
            </nav>
          </>
        )}

        <div className="flex-1" />
        <div className="flex items-center gap-1">{children}</div>
      </div>
    </header>
  )
}

export function NavLink({
  href,
  children,
  exact,
}: {
  href: string
  children: React.ReactNode
  exact?: boolean
}) {
  const pathname = usePathname()
  const active = exact ? pathname === href : Boolean(pathname?.startsWith(href))

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-md px-2.5 py-1.5 text-sm transition-colors duration-[var(--dur-1)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
        active
          ? 'font-medium text-[var(--foreground)]'
          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
      )}
    >
      {children}
    </Link>
  )
}
