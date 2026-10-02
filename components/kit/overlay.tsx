'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './button'

/**
 * Overlays.
 *
 * Deliberately thin. A modal is the last resort in this product, not the first
 * thought, so the only ones that exist are the two that genuinely interrupt:
 * a confirmation before something irreversible, and the deploy flow where the
 * user is committing to cloud resources. Everything else edits in place.
 */

export const Modal = DialogPrimitive.Root

export function ModalContent({
  className,
  children,
  title,
  description,
  footer,
  size = 'md',
  initialFocusRef,
  dismissible = true,
}: {
  className?: string
  children?: React.ReactNode
  /**
   * The element to focus when the dialog opens. Without it Radix focuses the first focusable
   * element, which is the close button. Use this instead of `autoFocus` on the field.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /** False while work is in progress that closing would orphan (Esc and the overlay do nothing). */
  dismissible?: boolean
  title: React.ReactNode
  /** Required. A dialog with no described purpose is a dialog nobody trusts. */
  description: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          'fixed inset-0 z-[var(--z-modal)] bg-[oklch(0.14_0.006_62/0.55)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
        )}
      />
      <DialogPrimitive.Content
        onOpenAutoFocus={(event) => {
          if (!initialFocusRef?.current) return
          event.preventDefault()
          initialFocusRef.current.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (!dismissible) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (!dismissible) event.preventDefault()
        }}
        className={cn(
          'fixed left-1/2 top-1/2 z-[var(--z-modal)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2',
          'rounded-xl border border-[var(--rule)] bg-[var(--surface-1)] shadow-[var(--shadow-lg)]',
          'duration-[var(--dur-3)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98]',
          size === 'sm' && 'max-w-sm',
          size === 'md' && 'max-w-lg',
          size === 'lg' && 'max-w-2xl',
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--rule)] px-4 py-3">
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-md font-medium tracking-[-0.012em]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {description}
            </DialogPrimitive.Description>
          </div>
          {dismissible && (
            <DialogPrimitive.Close asChild>
              <IconButton label="Close" size="sm" className="-mr-1 -mt-0.5">
                <X className="size-4" />
              </IconButton>
            </DialogPrimitive.Close>
          )}
        </div>

        {children && (
          <div className="scroll-thin max-h-[min(60vh,32rem)] overflow-y-auto px-4 py-4">
            {children}
          </div>
        )}

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--rule)] bg-[var(--surface-2)] px-4 py-3">
            {footer}
          </div>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export const Menu = DropdownPrimitive.Root
export const MenuTrigger = DropdownPrimitive.Trigger

export function MenuContent({
  className,
  align = 'end',
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-[var(--z-overlay)] min-w-[11rem] overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--popover)] p-1 text-[var(--popover-foreground)] shadow-[var(--shadow-md)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          className
        )}
        {...props}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  )
}

export function MenuItem({
  className,
  danger,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { danger?: boolean }) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2 rounded-[5px] px-2 py-1.5 text-sm outline-none',
        'data-[highlighted]:bg-[var(--surface-3)]',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        "[&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-[var(--muted-foreground)]",
        danger &&
          'text-[var(--destructive-text)] data-[highlighted]:bg-[color-mix(in_oklab,var(--destructive)_14%,transparent)] [&_svg]:text-[var(--destructive-text)]',
        className
      )}
      {...props}
    />
  )
}

export function MenuLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('truncate px-2 py-1.5 text-xs text-[var(--muted-foreground)]', className)} {...props} />
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-[var(--rule)]" />
}

export const TooltipProvider = TooltipPrimitive.Provider

/** A short label on hover and focus. Never the only place information lives. */
export function Tooltip({
  content,
  children,
  side = 'bottom',
}: {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-[var(--z-overlay)] rounded-md border border-[var(--rule)] bg-[var(--popover)] px-2 py-1 text-xs text-[var(--popover-foreground)] shadow-[var(--shadow-sm)]',
            'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95'
          )}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
