import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * The mark: registration corners around a plate, with the plate itself pushed
 * to one corner. Drafting registration marks, and an asymmetry that reads as
 * a page that has been placed rather than a logo that has been centred.
 *
 * Drawn on a 24 grid with 1.5 strokes so it stays legible at 16px, where most
 * of its life is spent.
 */
export function Mark({ size = 24, className, ...props }: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn('shrink-0', className)}
      {...props}
    >
      {/* Registration corners */}
      <path
        d="M3 7.5V3h4.5M16.5 3H21v4.5M21 16.5V21h-4.5M7.5 21H3v-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="square"
      />
      {/* The plate, offset up-left, with its own corner cut away */}
      <path d="M7 7h7.5L17 9.5V17H7V7Z" fill="currentColor" opacity="0.9" />
      <path d="M14.5 7v2.5H17" stroke="var(--background)" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

/**
 * The full lockup. The name is set in the mono display face, lowercase, with
 * the accent carried only by the mark so the wordmark stays readable when it
 * sits on a coloured surface.
 */
export function Wordmark({
  className,
  size = 20,
  showName = true,
}: {
  className?: string
  size?: number
  showName?: boolean
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Mark size={size} className="text-[var(--signal-text)]" />
      {showName && (
        <span className="font-mono text-[0.9375rem] font-medium tracking-[-0.04em] text-[var(--foreground)]">
          factory
        </span>
      )}
    </span>
  )
}
