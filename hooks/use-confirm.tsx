'use client'

import { useCallback, useRef, useState } from 'react'
import { Button, Modal, ModalContent } from '@/components/kit'

type ConfirmOptions = {
  title: string
  description: string
  /** Rendered as a monospace block. Use it for resource lists and file paths. */
  details?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

/**
 * A promise-based replacement for window.confirm.
 *
 *   const { confirm, confirmDialog } = useConfirm()
 *   if (!(await confirm({ title: 'Delete this?', description: '...' }))) return
 *
 * Render `confirmDialog` once anywhere in the component tree.
 *
 * This is one of only two modals in the product. It earns the interruption
 * because the thing on the other side of it is irreversible, or bills.
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolverRef.current?.(value)
    resolverRef.current = null
    setOptions(null)
  }, [])

  const confirmDialog = (
    <Modal
      open={options !== null}
      onOpenChange={(open) => {
        // Esc, the overlay, and the close button all land here. Every one of
        // them has to settle the promise rather than leave the caller awaiting
        // forever.
        if (!open) settle(false)
      }}
    >
      <ModalContent
        size="sm"
        title={options?.title ?? ''}
        description={options?.description ?? ''}
        footer={
          <>
            <Button onClick={() => settle(false)}>{options?.cancelLabel ?? 'Cancel'}</Button>
            <Button
              intent={options?.destructive ? 'danger' : 'primary'}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </>
        }
      >
        {options?.details && (
          <pre className="scroll-thin max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-[var(--rule)] bg-[var(--surface-2)] p-3 font-mono text-xs leading-relaxed">
            {options.details}
          </pre>
        )}
      </ModalContent>
    </Modal>
  )

  return { confirm, confirmDialog }
}
