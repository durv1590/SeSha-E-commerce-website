'use client';

import type { OrderDetailDto } from '@seshakart/types';
import { Alert, Button, Checkbox, FormField, Modal, Radio, Select, Textarea } from '@seshakart/ui';
import { RETURN_REASONS, type ReturnRequestInput } from '@seshakart/validation';
import { useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { ordersApi } from '@/lib/orders/api';
import { longDate } from '@/lib/orders/format';

export function ReturnRequestDialog({
  order,
  onClose,
  onDone,
}: {
  order: OrderDetailDto;
  onClose: () => void;
  onDone: (o: OrderDetailDto) => void;
}) {
  const eligible = order.items.filter((i) => i.returnableQuantity > 0);
  const [type, setType] = useState<ReturnRequestInput['type']>('RETURN');
  const [picked, setPicked] = useState<Record<string, number>>(
    eligible.length === 1 ? { [eligible[0]!.id]: 1 } : {},
  );
  const [reason, setReason] = useState<ReturnRequestInput['reason'] | ''>('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const items = Object.entries(picked)
      .filter(([, q]) => q > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    if (!items.length) return setError('Choose at least one item.');
    if (!reason) return setError('Please choose a reason.');
    setBusy(true);
    setError(null);
    try {
      onDone(
        await ordersApi.requestReturn(order.orderNumber, {
          type,
          reason,
          comments: comments || undefined,
          items,
        }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'We couldn’t send your request. Please try again.',
      );
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Return or replace items"
      description={
        order.returnDeadline
          ? `You can request this until ${longDate(order.returnDeadline)}.`
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} loadingText="Sending…" onClick={submit}>
            Submit request
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {error && <Alert variant="error">{error}</Alert>}
        <fieldset>
          <legend className="mb-1 text-small font-semibold">What would you like?</legend>
          <div className="flex flex-wrap gap-x-6">
            <Radio
              name="type"
              label="Return for a refund"
              checked={type === 'RETURN'}
              onChange={() => setType('RETURN')}
            />
            <Radio
              name="type"
              label="Replacement"
              checked={type === 'REPLACEMENT'}
              onChange={() => setType('REPLACEMENT')}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 text-small font-semibold">Items</legend>
          <ul className="flex flex-col gap-2">
            {order.items.map((i) => {
              const allowed = i.returnableQuantity;
              const q = picked[i.id] ?? 0;
              return (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3"
                >
                  <Checkbox
                    label={`${i.name}${i.variantName ? ` (${i.variantName})` : ''}`}
                    description={allowed ? undefined : 'Not eligible for return or replacement'}
                    disabled={!allowed}
                    checked={q > 0}
                    onChange={(e) => setPicked((p) => ({ ...p, [i.id]: e.target.checked ? 1 : 0 }))}
                  />
                  {allowed > 1 && q > 0 && (
                    <label className="flex items-center gap-2 text-small">
                      Qty
                      <select
                        className="h-control-sm rounded-input border border-border-strong bg-surface px-2"
                        value={q}
                        onChange={(e) =>
                          setPicked((p) => ({ ...p, [i.id]: Number(e.target.value) }))
                        }
                        aria-label={`Quantity of ${i.name} to return`}
                      >
                        {Array.from({ length: allowed }, (_, k) => k + 1).map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
        <FormField label="Reason" required>
          <Select
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as ReturnRequestInput['reason'])}
          >
            <option value="" disabled>
              Choose a reason
            </option>
            {Object.entries(RETURN_REASONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tell us more" hint="Optional. It helps us resolve this quickly.">
          <Textarea
            name="comments"
            rows={3}
            maxLength={500}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
          />
        </FormField>
      </div>
    </Modal>
  );
}
