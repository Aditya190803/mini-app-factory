'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@stackframe/stack';
import { cn } from '@/lib/utils';

type AccountMenuProps = {
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  loginClassName?: string;
  settingsPath?: string;
  redirectAfterLogout?: string;
};

export default function AccountMenu({
  className,
  buttonClassName,
  menuClassName,
  loginClassName,
  settingsPath = '/settings',
  redirectAfterLogout = '/',
}: AccountMenuProps) {
  const user = useUser();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isOpen]);

  if (!user) {
    return (
      <button
        onClick={() => router.push('/handler/sign-in')}
        className={cn(
          'inline-flex h-8 items-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          loginClassName
        )}
      >
        Sign in
      </button>
    );
  }

  const email = user.primaryEmail ?? 'Account';
  const initial = email.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className={cn('relative', className)} ref={menuRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Account menu for ${email}`}
        className={cn(
          'grid size-8 place-items-center rounded-lg border border-border bg-muted text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          buttonClassName
        )}
      >
        {initial}
      </button>
      {isOpen && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-elev-lg animate-in fade-in zoom-in-95 duration-150',
            menuClassName
          )}
        >
          <p className="truncate px-2.5 py-1.5 text-xs text-muted-foreground">{email}</p>
          <div className="my-1 h-px bg-border" />
          <button
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              router.push(settingsPath);
            }}
            className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Settings
          </button>
          <a
            role="menuitem"
            href={`/handler/sign-out?returnTo=${encodeURIComponent(redirectAfterLogout)}`}
            onClick={() => {
              setIsOpen(false);
              setIsLoggingOut(true);
            }}
            className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </a>
        </div>
      )}
    </div>
  );
}
