'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Form controls.
 *
 * `Field` owns the wiring that is easy to get wrong by hand: it generates the
 * id, points the label at the control, and hangs the hint and the error off
 * `aria-describedby` so both are announced. Controls rendered inside it read
 * that context, which is why they take no id of their own in the common case.
 *
 * Errors live under the control and are always text. A red border alone is a
 * colour-only signal, and half the people who need the message would not see
 * it.
 */

type FieldContextValue = {
  id: string
  hintId?: string
  errorId?: string
  invalid: boolean
  disabled: boolean
}

const FieldContext = React.createContext<FieldContextValue | null>(null)

function useFieldControl() {
  const ctx = React.useContext(FieldContext)
  if (!ctx) return {}
  const describedBy = [ctx.hintId, ctx.errorId].filter(Boolean).join(' ') || undefined
  return {
    id: ctx.id,
    'aria-describedby': describedBy,
    'aria-invalid': ctx.invalid || undefined,
    disabled: ctx.disabled || undefined,
  }
}

export type FieldProps = {
  label: React.ReactNode
  /** Guidance shown before the user makes a mistake. */
  hint?: React.ReactNode
  /** Shown after. Replaces nothing; it sits below the hint. */
  error?: React.ReactNode
  /** Visually hides the label without removing it from the tree. */
  hideLabel?: boolean
  optional?: boolean
  disabled?: boolean
  className?: string
  children: React.ReactNode
  /** Right-aligned control beside the label, for a reset or a counter. */
  aside?: React.ReactNode
}

export function Field({
  label,
  hint,
  error,
  hideLabel,
  optional,
  disabled = false,
  className,
  children,
  aside,
}: FieldProps) {
  const reactId = React.useId()
  const id = `f${reactId.replace(/[^a-zA-Z0-9]/g, '')}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <FieldContext.Provider value={{ id, hintId, errorId, invalid: Boolean(error), disabled }}>
      <div className={cn('space-y-1.5', className)}>
        <div className="flex items-baseline justify-between gap-3">
          <label
            htmlFor={id}
            className={cn(
              'text-xs font-medium text-[var(--foreground)]',
              hideLabel && 'sr-only',
              disabled && 'opacity-50'
            )}
          >
            {label}
            {optional && (
              <span className="ml-1.5 font-normal text-[var(--muted-foreground)]">optional</span>
            )}
          </label>
          {aside && !hideLabel && <div className="shrink-0">{aside}</div>}
        </div>

        {children}

        {hint && (
          <p id={hintId} className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs font-medium text-[var(--destructive-text)]">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  )
}

const controlBase = [
  'w-full rounded-md border bg-[var(--surface-1)] text-[var(--foreground)]',
  'border-[var(--rule-strong)]',
  'placeholder:text-[var(--muted-foreground)]',
  'transition-[border-color,box-shadow] duration-[var(--dur-1)] ease-[var(--ease-out-quint)]',
  'outline-none',
  'hover:border-[var(--muted-foreground)]',
  'focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_18%,transparent)]',
  'aria-[invalid]:border-[var(--destructive)] aria-[invalid]:focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_20%,transparent)]',
  'disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:opacity-60',
].join(' ')

export const Input = React.forwardRef<HTMLInputElement, React.ComponentPropsWithoutRef<'input'>>(
  function Input({ className, ...props }, ref) {
    const field = useFieldControl()
    return (
      <input
        ref={ref}
        {...field}
        {...props}
        className={cn(controlBase, 'h-8 px-2.5 text-sm', className)}
      />
    )
  }
)

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentPropsWithoutRef<'textarea'>
>(function Textarea({ className, ...props }, ref) {
  const field = useFieldControl()
  return (
    <textarea
      ref={ref}
      {...field}
      {...props}
      className={cn(controlBase, 'min-h-20 resize-y px-2.5 py-2 text-sm leading-relaxed', className)}
    />
  )
})

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.ComponentPropsWithoutRef<'select'>
>(function Select({ className, children, ...props }, ref) {
  const field = useFieldControl()
  return (
    <div className="relative">
      <select
        ref={ref}
        {...field}
        {...props}
        className={cn(controlBase, 'h-8 appearance-none pl-2.5 pr-8 text-sm', className)}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--muted-foreground)]"
      >
        <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </div>
  )
})

/**
 * A checkbox that keeps its label in the same hit target. Uses the native
 * input so indeterminate, form submission, and assistive tech all keep
 * working; only the box itself is restyled.
 */
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: React.ComponentPropsWithoutRef<'input'> & { label: React.ReactNode; hint?: React.ReactNode }) {
  const id = React.useId()
  return (
    <div className={cn('flex gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer rounded-[4px] border border-[var(--rule-strong)] bg-[var(--surface-1)]',
          'accent-[var(--primary)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm text-[var(--foreground)]">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{hint}</p>}
      </div>
    </div>
  )
}

/**
 * A segmented control. Radio semantics, not buttons, because exactly one
 * option is always chosen and arrow keys should move between them.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
  className,
}: {
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<{ value: T; label: React.ReactNode; icon?: React.ReactNode; title?: string }>
  label: string
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-0.5',
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] font-medium',
              'transition-colors duration-[var(--dur-1)] ease-[var(--ease-out-quint)]',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-sm',
              active
                ? 'bg-[var(--surface-1)] text-[var(--foreground)] shadow-[var(--shadow-xs)]'
                : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
