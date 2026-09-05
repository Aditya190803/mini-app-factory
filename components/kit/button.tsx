'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * One button vocabulary for the whole product.
 *
 * Five intents, and they are ranked: `primary` is the single committing action
 * on a surface, `default` is everything reversible, `quiet` is chrome, `danger`
 * destroys, `link` is inline text. If two buttons on a screen are both
 * `primary`, one of them is wrong.
 *
 * Every intent carries the full state set (hover, focus-visible, active,
 * disabled, busy) because a button that only styles three of them is where
 * interfaces start feeling unfinished.
 */
const button = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-1.5',
    'whitespace-nowrap rounded-md font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform]',
    'duration-[var(--dur-1)] ease-[var(--ease-out-quint)]',
    'active:translate-y-px',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
    'disabled:pointer-events-none disabled:opacity-45',
    'data-[busy=true]:pointer-events-none',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      intent: {
        primary:
          'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-hover)]',
        default:
          'border border-[var(--rule-strong)] bg-[var(--surface-1)] text-[var(--foreground)] shadow-[var(--shadow-xs)] hover:bg-[var(--surface-2)] hover:border-[var(--muted-foreground)] active:bg-[var(--surface-3)]',
        quiet:
          'text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] active:bg-[var(--surface-3)]',
        danger:
          'bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:brightness-110 active:brightness-95',
        link: 'text-[var(--signal-text)] underline decoration-[1.5px] underline-offset-[3px] hover:decoration-2 active:translate-y-0',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-10 px-4 text-base',
      },
      block: {
        true: 'w-full',
      },
    },
    compoundVariants: [
      { intent: 'link', size: 'sm', class: 'h-auto p-0' },
      { intent: 'link', size: 'md', class: 'h-auto p-0' },
      { intent: 'link', size: 'lg', class: 'h-auto p-0' },
    ],
    defaultVariants: { intent: 'default', size: 'md' },
  }
)

export type ButtonProps = React.ComponentPropsWithoutRef<'button'> &
  VariantProps<typeof button> & {
    asChild?: boolean
    /**
     * Swaps the label for a spinner while keeping the button's measured width,
     * so a row of controls does not reflow the instant something is clicked.
     */
    busy?: boolean
  }

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, intent, size, block, asChild, busy, children, disabled, ...props },
  ref
) {
  const Comp = (asChild ? Slot : 'button') as React.ElementType

  return (
    <Comp
      ref={ref}
      data-busy={busy || undefined}
      aria-busy={busy || undefined}
      disabled={asChild ? undefined : disabled || busy}
      className={cn(button({ intent, size, block }), className)}
      {...props}
    >
      {busy ? (
        <>
          <span className="invisible contents">{children}</span>
          <Spinner className="absolute" />
        </>
      ) : (
        children
      )}
    </Comp>
  )
})

const iconButton = cva(
  [
    'grid shrink-0 place-items-center rounded-md',
    'transition-colors duration-[var(--dur-1)] ease-[var(--ease-out-quint)]',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
    'disabled:pointer-events-none disabled:opacity-40',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      intent: {
        quiet:
          'text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] active:bg-[var(--surface-3)]',
        default:
          'border border-[var(--rule-strong)] bg-[var(--surface-1)] text-[var(--foreground)] hover:bg-[var(--surface-2)]',
        danger:
          'text-[var(--muted-foreground)] hover:bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] hover:text-[var(--destructive-text)]',
      },
      size: {
        sm: 'size-7',
        md: 'size-8',
        lg: 'size-10',
      },
      /** Marks a toggle as on. Pair with aria-pressed, never on its own. */
      on: {
        true: 'bg-[var(--surface-3)] text-[var(--foreground)]',
      },
    },
    defaultVariants: { intent: 'quiet', size: 'md' },
  }
)

export type IconButtonProps = React.ComponentPropsWithoutRef<'button'> &
  VariantProps<typeof iconButton> & {
    /** Required. An icon with no accessible name is an unlabelled control. */
    label: string
    /**
     * Renders the child element instead of a button, keeping the styling. Use
     * it for icon-shaped links: a nested <a> inside a <button> is invalid and
     * unreachable by keyboard.
     */
    asChild?: boolean
  }

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, intent, size, on, label, asChild, type, ...props },
  ref
) {
  const Comp = (asChild ? Slot : 'button') as React.ElementType
  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? 'button')}
      aria-label={label}
      title={label}
      className={cn(iconButton({ intent, size, on }), className)}
      {...props}
    />
  )
})

/** Buttons that act on one thing, joined so they read as one control. */
export function ButtonGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex items-center rounded-md',
        '[&>*]:rounded-none [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md',
        '[&>*+*]:-ml-px',
        className
      )}
      {...props}
    />
  )
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role="status"
      aria-label={label ?? 'Loading'}
      className={cn(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em]',
        className
      )}
    />
  )
}

/** A keyboard hint. Rendered as a real kbd so screen readers announce it. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-[var(--rule)] bg-[var(--surface-2)] px-1 text-[10px] font-medium text-[var(--muted-foreground)]',
        className
      )}
    >
      {children}
    </kbd>
  )
}

export { button as buttonVariants }
