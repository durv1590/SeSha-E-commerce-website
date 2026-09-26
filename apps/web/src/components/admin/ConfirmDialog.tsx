'use client';

import { Alert, Button, Modal } from '@seshakart/ui';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/errors';

/** Asks before a consequential action; shows the API's message if it fails. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
                onClose();
              } catch (err) {
                setError(
                  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}
    </Modal>
  );
}
