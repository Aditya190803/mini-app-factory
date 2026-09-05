'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wordmark } from '@/components/brand/mark'
import { APP_FOOTER_GROUPS, APP_NAME } from '@/lib/constants'

/**
 * The footer, laid out as a plate: a wordmark column, then grouped links under
 * uppercase keys. Hidden inside the editor, where a full-height workspace has
 * no room for legal navigation below it.
 */
export function SiteFooter() {
  const pathname = usePathname()
  if (pathname?.startsWith('/edit')) return null

  return (
    <footer className="border-t border-[var(--rule)] bg-[var(--background)]">
      <div className="mx-auto grid w-full max-w-[84rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
            Describe an application, read the files it produces, then publish it to Cloudflare.
          </p>
        </div>

        {APP_FOOTER_GROUPS.map((group) => (
          <nav key={group.title} aria-label={group.title}>
            <h2 className="key">{group.title}</h2>
            <ul className="mt-3 space-y-2">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="rounded text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="mx-auto flex w-full max-w-[84rem] flex-wrap items-center justify-between gap-2 border-t border-[var(--rule)] px-4 py-4 sm:px-6">
        <p className="font-mono text-xs text-[var(--muted-foreground)]">
          {APP_NAME}
        </p>
        <p className="font-mono text-xs text-[var(--muted-foreground)]">
          Built on Cloudflare Pages, Workers, D1, KV, R2
        </p>
      </div>
    </footer>
  )
}
