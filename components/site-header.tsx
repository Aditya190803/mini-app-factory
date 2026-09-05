import Link from 'next/link';
import type { ReactNode } from 'react';
import { FactoryIcon } from '@/components/ui/factory-icon';

export function SiteHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <FactoryIcon size={18} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{title}</span>
        </Link>
        <div className="flex items-center gap-1">{children}</div>
      </div>
    </header>
  );
}

export function SiteHeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:px-3"
    >
      {children}
    </Link>
  );
}
