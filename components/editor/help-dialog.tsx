'use client';

import { Button, Kbd, Modal, ModalContent, SpecTable } from '@/components/kit';

export default function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Shortcuts and tips"
        description="How the workspace is meant to be driven."
        footer={
          <Button intent="primary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        }
      >
        <div className="space-y-6">
          <section>
            <h3 className="key">Keyboard</h3>
            <div className="mt-2">
              <SpecTable
                dense
                caption="Keyboard shortcuts"
                rows={[
                  { key: 'quick', label: <Kbd>Ctrl P</Kbd>, value: 'Jump to a file. Arrow keys move, Enter opens.' },
                  { key: 'save', label: <Kbd>Ctrl S</Kbd>, value: 'Save every file now.' },
                  { key: 'files', label: <Kbd>Ctrl B</Kbd>, value: 'Show or hide the file tree.' },
                  { key: 'chat', label: <Kbd>Ctrl I</Kbd>, value: 'Show or hide the conversation.' },
                  { key: 'send', label: <Kbd>Ctrl Enter</Kbd>, value: 'Send the request in the composer.' },
                  { key: 'tree', label: <Kbd>↑ ↓ ← →</Kbd>, value: 'Move through the file tree; Enter opens, ← and → fold folders.' },
                ]}
              />
            </div>
          </section>

          <section>
            <h3 className="key">Getting better results</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              <li>
                Name the outcome, not the styling. &ldquo;Overdue invoices sort to the top&rdquo; beats &ldquo;make it
                modern&rdquo;.
              </li>
              <li>
                Use the crosshair in the preview to pick an element, then describe the change. The selected element is
                sent with the request.
              </li>
              <li>Switch the conversation to Discuss when you want an answer rather than an edit. Discuss never writes files.</li>
              <li>Type @ in the composer to reference a file by path.</li>
            </ul>
          </section>
        </div>
      </ModalContent>
    </Modal>
  );
}
