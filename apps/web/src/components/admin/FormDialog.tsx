'use client';

import { Alert, Button, Modal } from '@seshakart/ui';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';

/**
 * A modal form: runs `onSubmit`, shows field errors (from the callback or the API)
 * through `children(errors)` and the API's message on failure.
 */
export function FormDialog({
  open,
  onClose,
  title,
  description,
  submitLabel,
  danger,
  onSubmit,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  submitLabel: string;
  danger?: boolean;
  /** Return field errors to stop; resolve normally when done. */
  onSubmit: () => Promise<Record<string, string> | void>;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setErrors({});
    setMessage(null);
    onClose();
  };
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const errs = await onSubmit();
      if (errs && Object.keys(errs).length) {
        setErrors(errs);
        return;
      }
      setErrors({});
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setMessage(err.message);
      } else setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {message && <Alert variant="error">{message}</Alert>}
        {children(errors)}
      </form>
    </Modal>
  );
}
