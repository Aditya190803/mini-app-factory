'use client';

import * as React from 'react';
import { Button, Field, Input, Modal, ModalContent } from '@/components/kit';

export type NameDialogRequest = {
  title: string;
  description: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  hint?: string;
  submitLabel: string;
  /** Return an error message to keep the dialog open, or null when the value was accepted. */
  onSubmit: (value: string) => string | null;
};

/**
 * One dialog for every "type a name" step: new file, new folder, rename. These were three
 * near-identical hand-written modals that used `autoFocus` and only reported errors as toasts.
 * Errors now show under the field, where the user is looking.
 */
export default function NameDialog({ request, onClose }: { request: NameDialogRequest | null; onClose: () => void }) {
  const [value, setValue] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!request) return;
    setValue(request.initialValue ?? '');
    setError(null);
  }, [request]);

  const submit = () => {
    if (!request) return;
    const result = request.onSubmit(value.trim());
    if (result) setError(result);
    else onClose();
  };

  return (
    <Modal open={request !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalContent
        size="sm"
        initialFocusRef={inputRef}
        title={request?.title ?? ''}
        description={request?.description ?? ''}
        footer={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button intent="primary" onClick={submit}>
              {request?.submitLabel ?? 'Save'}
            </Button>
          </>
        }
      >
        <Field label={request?.label ?? 'Name'} hint={request?.hint} error={error ?? undefined}>
          <Input
            ref={inputRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            placeholder={request?.placeholder}
            className="font-mono"
            aria-invalid={error ? true : undefined}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
          />
        </Field>
      </ModalContent>
    </Modal>
  );
}
