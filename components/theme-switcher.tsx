'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { DesktopIcon, MoonIcon, SunIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

const OPTIONS = [
  { value: 'system', label: 'System', Icon: DesktopIcon },
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
] as const

export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Theme is unknowable until hydration; render a stable placeholder
  // so the server and client markup agree.
  useEffect(() => setMounted(true), [])

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = mounted && theme === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'grid size-7 place-items-center rounded-full transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active
                ? 'bg-background text-foreground shadow-elev-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={15} weight={active ? 'fill' : 'regular'} />
          </button>
        )
      })}
    </div>
  )
}
