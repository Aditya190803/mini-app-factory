'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { APP_FOOTER_LINKS, APP_NAME } from '@/lib/constants'

export function SiteFooter() {
  const pathname = usePathname()

  // The editor is a full-height workspace; legal links below it are noise.
  if (pathname?.startsWith('/edit')) return null

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">{APP_NAME}</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          {APP_FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
