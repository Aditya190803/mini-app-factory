'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@stackframe/stack'
import { LogOut, Settings, LayoutGrid, ShieldCheck } from 'lucide-react'
import { Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/kit'
import { cn } from '@/lib/utils'

/**
 * Account control. Signed out it is a single sign-in button; signed in it is
 * an initial that opens the menu.
 *
 * Sign out is a link to the handler rather than a click handler, so it still
 * works if JavaScript has not settled and so it can be opened in a new tab
 * like any other navigation.
 */
export function AccountMenu({
  className,
  redirectAfterLogout = '/',
  isAdmin = false,
}: {
  className?: string
  redirectAfterLogout?: string
  isAdmin?: boolean
}) {
  const user = useUser()
  const router = useRouter()

  if (!user) {
    return (
      <Button intent="primary" size="sm" onClick={() => router.push('/handler/sign-in')}>
        Sign in
      </Button>
    )
  }

  const email = user.primaryEmail ?? 'Account'
  const initial = email.trim().charAt(0).toUpperCase() || '?'

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${email}`}
          className={cn(
            'grid size-7 place-items-center rounded-md border border-[var(--rule-strong)] bg-[var(--surface-2)]',
            'text-xs font-medium text-[var(--foreground)]',
            'transition-colors duration-[var(--dur-1)] hover:bg-[var(--surface-3)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
            className
          )}
        >
          {initial}
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{email}</MenuLabel>
        <MenuSeparator />
        <MenuItem onSelect={() => router.push('/dashboard')}>
          <LayoutGrid />
          Projects
        </MenuItem>
        <MenuItem onSelect={() => router.push('/settings')}>
          <Settings />
          Settings
        </MenuItem>
        {isAdmin && (
          <MenuItem onSelect={() => router.push('/admin')}>
            <ShieldCheck />
            Admin
          </MenuItem>
        )}
        <MenuSeparator />
        <MenuItem asChild>
          <a href={`/handler/sign-out?returnTo=${encodeURIComponent(redirectAfterLogout)}`}>
            <LogOut />
            Sign out
          </a>
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export default AccountMenu
