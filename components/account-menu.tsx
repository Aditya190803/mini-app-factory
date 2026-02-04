'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@stackframe/stack';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/logout';

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
          'px-5 py-2 text-[9px] font-mono border border-[var(--primary)]/30 bg-[var(--primary)]/5 uppercase hover:bg-[var(--primary)] hover:text-black transition-all text-[var(--primary)]',
          loginClassName
        )}
      >
        Login
      </button>
    );
  }

  const handleLogout = async () => {
    if (!user) return;
    setIsOpen(false);
    setIsLoggingOut(true);
    await logout(user, redirectAfterLogout);
    setIsLoggingOut(false);
  };

  return (
    <div className={cn('relative', className)} ref={menuRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 text-[9px] font-mono border border-[var(--border)] uppercase hover:bg-white hover:text-black transition-all',
          buttonClassName
        )}
      >
        <span className="text-[10px] font-mono text-white opacity-60 uppercase truncate max-w-[160px]">
          {user.primaryEmail}
        </span>
        <span className="text-[10px]">▾</span>
      </button>
      {isOpen && (
        <div className={cn('absolute right-0 mt-2 w-40 border border-[var(--border)] bg-[var(--background-surface)] shadow-lg z-[999]', menuClassName)}>
          <button
            onClick={() => {
              setIsOpen(false);
              router.push(settingsPath);
            }}
            className="w-full text-left px-3 py-2 text-[9px] font-mono uppercase hover:bg-[var(--background-overlay)]"
          >
            Settings
          </button>
          <a
            href={`/handler/sign-out?returnTo=${encodeURIComponent(redirectAfterLogout)}`}
            onClick={() => {
              setIsOpen(false);
              setIsLoggingOut(true);
            }}
            className="w-full text-left px-3 py-2 text-[9px] font-mono uppercase hover:bg-[var(--background-overlay)] block"
          >
            {isLoggingOut ? 'Logging out...' : 'Logout'}
          </a>
        </div>
      )}
    </div>
  );
}
