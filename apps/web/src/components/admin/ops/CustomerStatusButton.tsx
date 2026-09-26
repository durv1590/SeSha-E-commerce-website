'use client';

import { Button, FormField, Textarea, useToast } from '@seshakart/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { FormDialog } from '../FormDialog';

/** Suspend (signs the customer out everywhere) or reactivate an account. */
export function CustomerStatusButton({
  id,
  name,
  status,
}: {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED';
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const suspending = status === 'ACTIVE';
  return (
    <>
      <Button
        variant={suspending ? 'outline' : 'primary'}
        className={suspending ? 'text-error-text' : undefined}
        onClick={() => {
          setReason('');
          setOpen(true);
        }}
      >
        {suspending ? 'Suspend account' : 'Reactivate account'}
      </Button>
      <FormDialog
        open={open}
        onClose={() => setOpen(false)}
        title={suspending ? `Suspend ${name}?` : `Reactivate ${name}?`}
        description={
          suspending
            ? 'They are signed out on every device and can’t sign in or place orders until you reactivate the account. Existing orders are not affected.'
            : 'They will be able to sign in and order again.'
        }
        submitLabel={suspending ? 'Suspend' : 'Reactivate'}
        danger={suspending}
        onSubmit={async () => {
          if (suspending && reason.trim().length < 3)
            return { reason: 'Say why the account is being suspended' };
          await api.post(`/admin/customers/${id}/status`, {
            status: suspending ? 'SUSPENDED' : 'ACTIVE',
            reason: reason.trim() || undefined,
          });
          toast({
            title: suspending ? 'Account suspended' : 'Account reactivated',
            variant: 'success',
          });
          router.refresh();
        }}
      >
        {(e) => (
          <FormField
            label={suspending ? 'Reason' : 'Note (optional)'}
            required={suspending}
            hint="Staff only; recorded in the audit log"
            error={e.reason}
          >
            <Textarea
              name="reason"
              value={reason}
              rows={2}
              maxLength={300}
              onChange={(ev) => setReason(ev.target.value)}
            />
          </FormField>
        )}
      </FormDialog>
    </>
  );
}
