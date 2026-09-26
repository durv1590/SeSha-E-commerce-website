'use client';

import type { OrderDetailDto } from '@seshakart/types';
import { Alert, Button, FormField, Modal, Select, Textarea } from '@seshakart/ui';
import { CANCEL_REASONS, type CancelOrderInput } from '@seshakart/validation';
import { useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { ordersApi } from '@/lib/orders/api';

export function CancelOrderDialog({
  order,
  onClose,
  onDone,
}: {
  order: OrderDetailDto;
  onClose: () => void;
  onDone: (o: OrderDetailDto) => void;
}) {
  const [reason, setReason] = useState<CancelOrderInput['reason'] | ''>('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paidOnline = order.paymentMethod === 'PREPAID' && order.paymentStatus === 'CAPTURED';

  const submit = async () => {
    if (!reason) return setError('Please choose a reason.');
    setBusy(true);
    setError(null);
    try {
      onDone(
        await ordersApi.cancel(order.orderNumber, { reason, comments: comments || undefined }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'We couldn’t cancel the order. Please try again.',
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Cancel this order?"
      description={
        paidOnline
          ? 'Your payment will be refunded to the original payment method (usually 5–7 working days).'
          : 'Nothing has been charged for this order.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" loading={busy} loadingText="Cancelling…" onClick={submit}>
            Cancel order
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}
        <FormField
          label="Reason for cancelling"
          required
          error={!reason && error ? error : undefined}
        >
          <Select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as CancelOrderInput['reason'])}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {Object.entries(CANCEL_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Anything else?" hint="Optional">
          <Textarea
            name="comments"
            rows={2}
            maxLength={500}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
