'use client';

import type { AdminOrderDto } from '@seshakart/types';
import {
  Button,
  Checkbox,
  FormField,
  Input,
  Select,
  Textarea,
  formatINR,
  useToast,
} from '@seshakart/ui';
import { CARRIERS, SHIPMENT_EVENT_STATUSES } from '@seshakart/validation';
import { Ban, IndianRupee, PackageCheck, Truck, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { paiseToRupees, rupeesToPaise } from '@/lib/admin/money';
import { FormDialog } from '../FormDialog';

const CARRIER_LABELS: Record<(typeof CARRIERS)[number], string> = {
  delhivery: 'Delhivery',
  bluedart: 'Blue Dart',
  dtdc: 'DTDC',
  indiapost: 'India Post',
  shiprocket: 'Shiprocket',
  ecomexpress: 'Ecom Express',
  xpressbees: 'Xpressbees',
  other: 'Other courier',
};
const EVENT_LABELS: Record<(typeof SHIPMENT_EVENT_STATUSES)[number], string> = {
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED: 'Delivery attempt failed',
  RETURNED: 'Returned to us (undeliverable)',
};

type Open =
  | null
  | { kind: 'status'; status: 'PROCESSING' | 'PACKED' }
  | { kind: 'ship' }
  | { kind: 'event' }
  | { kind: 'cancel' }
  | { kind: 'refund' }
  | { kind: 'manual'; refundId: string; amount: number }
  | { kind: 'return'; id: string; action: 'approve' | 'reject' | 'receive' | 'complete' };

const RETURN_ACTION: Record<
  'approve' | 'reject' | 'receive' | 'complete',
  { label: string; title: string; description: string }
> = {
  approve: {
    label: 'Approve',
    title: 'Approve this request?',
    description: 'The customer is told to expect a pickup. Arrange the pickup with your courier.',
  },
  reject: {
    label: 'Reject',
    title: 'Reject this request?',
    description: 'Tell the customer why. They’ll see your note in their order.',
  },
  receive: {
    label: 'Mark received',
    title: 'Mark the items as received?',
    description: 'Record that the returned items reached the warehouse.',
  },
  complete: {
    label: 'Complete',
    title: 'Complete this request?',
    description:
      'For a return, the refund for the returned items starts automatically: online payments go back to the original method, and cash-on-delivery refunds appear under “Manual refunds to pay”. For a replacement, dispatch the new item.',
  },
};

/** Staff actions for one order. Each calls the order API and refreshes the page. */
export function OrderActions({
  order,
  permissions,
}: {
  order: AdminOrderDto;
  permissions: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState<Open>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState(true);
  const canWrite = permissions.includes('orders:write');
  const canRefund = permissions.includes('orders:refund');
  const base = `/admin/orders/${order.orderNumber}`;
  const a = order.actions;

  const start = (o: Open, initial: Record<string, string> = {}) => {
    setF(initial);
    setRestock(true);
    setOpen(o);
  };
  const field = (name: string) => ({
    name,
    value: f[name] ?? '',
    onChange: (e: { target: { value: string } }) =>
      setF((prev) => ({ ...prev, [name]: e.target.value })),
  });
  const done = (title: string) => {
    toast({ title, variant: 'success' });
    router.refresh();
  };
  const close = () => setOpen(null);

  const pendingManual = order.staffRefunds.filter((r) => r.manual && r.status === 'PENDING');
  const openReturns = order.returns.filter((r) =>
    ['REQUESTED', 'APPROVED', 'RECEIVED'].includes(r.status),
  );
  const writeActions =
    a.statuses.length > 0 ||
    a.canShip ||
    a.canAddTrackingEvent ||
    a.canCancel ||
    openReturns.length > 0;
  const refundActions = a.refundable > 0 || pendingManual.length > 0;
  const nothing = !writeActions && !refundActions;
  const permitted = (canWrite && writeActions) || (canRefund && refundActions);

  return (
    <section
      aria-labelledby="actions-h"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h2 id="actions-h" className="text-h5">
        Actions
      </h2>
      {nothing && (
        <p className="text-small text-text-muted">Nothing to do for this order right now.</p>
      )}
      {!nothing && !permitted && (
        <p className="text-small text-text-muted">You can view this order but not change it.</p>
      )}
      <div className="flex flex-col gap-2">
        {canWrite &&
          a.statuses.map((s) => (
            <Button key={s} variant="outline" onClick={() => start({ kind: 'status', status: s })}>
              <PackageCheck size={16} aria-hidden="true" /> Mark as{' '}
              {s === 'PACKED' ? 'packed' : 'processing'}
            </Button>
          ))}
        {canWrite && a.canShip && (
          <Button onClick={() => start({ kind: 'ship' }, { carrier: 'delhivery' })}>
            <Truck size={16} aria-hidden="true" /> Dispatch
          </Button>
        )}
        {canWrite && a.canAddTrackingEvent && (
          <Button
            variant="outline"
            onClick={() => start({ kind: 'event' }, { status: 'IN_TRANSIT' })}
          >
            <MapPin size={16} aria-hidden="true" /> Add tracking update
          </Button>
        )}
        {canRefund && a.refundable > 0 && (
          <Button
            variant="outline"
            onClick={() => start({ kind: 'refund' }, { amount: paiseToRupees(a.refundable) })}
          >
            <IndianRupee size={16} aria-hidden="true" /> Refund
          </Button>
        )}
        {canWrite && a.canCancel && (
          <Button
            variant="outline"
            className="text-error-text"
            onClick={() => start({ kind: 'cancel' })}
          >
            <Ban size={16} aria-hidden="true" /> Cancel order
          </Button>
        )}
      </div>

      {canRefund && pendingManual.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-small font-semibold">Manual refunds to pay</h3>
          {pendingManual.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 text-small"
            >
              <span className="tabular-nums">{formatINR(r.amount)} by bank transfer or UPI</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => start({ kind: 'manual', refundId: r.id, amount: r.amount })}
              >
                Record payment<span className="sr-only"> of {formatINR(r.amount)}</span>
              </Button>
            </div>
          ))}
        </div>
      )}

      {canWrite && openReturns.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <h3 className="text-small font-semibold">Return requests</h3>
          {openReturns.map((r) => {
            const actions: ('approve' | 'reject' | 'receive' | 'complete')[] =
              r.status === 'REQUESTED'
                ? ['approve', 'reject']
                : r.status === 'APPROVED'
                  ? ['receive']
                  : ['complete'];
            return (
              <div key={r.id} className="flex flex-col gap-1.5 text-small">
                <span>
                  {r.type === 'RETURN' ? 'Return' : 'Replacement'} · {r.statusLabel}
                </span>
                <span className="flex flex-wrap gap-2">
                  {actions.map((act) => (
                    <Button
                      key={act}
                      size="sm"
                      variant={act === 'reject' ? 'ghost' : 'outline'}
                      onClick={() => start({ kind: 'return', id: r.id, action: act })}
                    >
                      {RETURN_ACTION[act].label}
                      <span className="sr-only">
                        {' '}
                        {r.type === 'RETURN' ? 'return' : 'replacement'} request
                      </span>
                    </Button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ------------------------------------------------------------- dialogs */}
      <FormDialog
        open={open?.kind === 'status'}
        onClose={close}
        title={
          open?.kind === 'status' && open.status === 'PACKED'
            ? 'Mark as packed?'
            : 'Mark as processing?'
        }
        submitLabel="Update status"
        onSubmit={async () => {
          if (open?.kind !== 'status') return;
          await api.post(`${base}/status`, { status: open.status, note: f.note || undefined });
          done('Status updated');
        }}
      >
        {(e) => (
          <FormField label="Note (optional)" hint="Staff only" error={e.note}>
            <Input {...field('note')} maxLength={300} />
          </FormField>
        )}
      </FormDialog>

      <FormDialog
        open={open?.kind === 'ship'}
        onClose={close}
        title="Dispatch order"
        description="Records the shipment, issues the GST invoice and tells the customer it’s on its way."
        submitLabel="Dispatch"
        onSubmit={async () => {
          const errs: Record<string, string> = {};
          if (!/^[A-Za-z0-9-]{4,40}$/.test((f.trackingNumber ?? '').trim()))
            errs.trackingNumber = 'Enter the tracking number (letters, digits, hyphens)';
          if (f.trackingUrl && !/^https:\/\//.test(f.trackingUrl.trim()))
            errs.trackingUrl = 'Use an https:// link';
          if (Object.keys(errs).length) return errs;
          await api.post(`${base}/shipments`, {
            carrier: f.carrier,
            trackingNumber: f.trackingNumber!.trim(),
            trackingUrl: f.trackingUrl?.trim() || undefined,
          });
          done('Order dispatched');
        }}
      >
        {(e) => (
          <>
            <FormField label="Courier" required error={e.carrier}>
              <Select {...field('carrier')}>
                {CARRIERS.map((c) => (
                  <option key={c} value={c}>
                    {CARRIER_LABELS[c]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Tracking number" required error={e.trackingNumber}>
              <Input {...field('trackingNumber')} maxLength={40} spellCheck={false} />
            </FormField>
            <FormField
              label="Tracking link"
              hint="Optional https:// link from the courier"
              error={e.trackingUrl}
            >
              <Input {...field('trackingUrl')} type="url" inputMode="url" maxLength={300} />
            </FormField>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={open?.kind === 'event'}
        onClose={close}
        title="Add tracking update"
        description="Customers see these updates in their order. “Delivered” completes the order."
        submitLabel="Add update"
        onSubmit={async () => {
          await api.post(`${base}/shipments/events`, {
            status: f.status,
            location: f.location?.trim() || undefined,
            note: f.note?.trim() || undefined,
          });
          done('Tracking updated');
        }}
      >
        {(e) => (
          <>
            <FormField label="Update" required error={e.status}>
              <Select {...field('status')}>
                {SHIPMENT_EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {EVENT_LABELS[s]}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Location" error={e.location}>
              <Input {...field('location')} maxLength={120} placeholder="e.g. Pune hub" />
            </FormField>
            <FormField label="Note" error={e.note}>
              <Input {...field('note')} maxLength={300} />
            </FormField>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={open?.kind === 'cancel'}
        onClose={close}
        title="Cancel this order?"
        description="Stock is put back and the customer is told. A paid order is refunded to the original payment method."
        submitLabel="Cancel order"
        danger
        onSubmit={async () => {
          if ((f.reason ?? '').trim().length < 3)
            return { reason: 'Say why the order is cancelled' };
          await api.post(`${base}/cancel`, { reason: f.reason!.trim() });
          done('Order cancelled');
        }}
      >
        {(e) => (
          <FormField label="Reason" required hint="The customer sees this" error={e.reason}>
            <Textarea {...field('reason')} rows={2} maxLength={300} />
          </FormField>
        )}
      </FormDialog>

      <FormDialog
        open={open?.kind === 'refund'}
        onClose={close}
        title="Refund"
        description={
          a.refundIsManual
            ? 'Cash-on-delivery money goes back by bank transfer or UPI. After paying, record the transaction reference here.'
            : 'The refund goes back to the original payment method and usually arrives in 5–7 working days.'
        }
        submitLabel="Refund"
        onSubmit={async () => {
          const amount = rupeesToPaise(f.amount ?? '');
          const errs: Record<string, string> = {};
          if (amount === null || amount <= 0) errs.amount = 'Enter an amount';
          else if (amount > a.refundable) errs.amount = `At most ${formatINR(a.refundable)}`;
          if ((f.reason ?? '').trim().length < 3) errs.reason = 'Say why you’re refunding';
          if (Object.keys(errs).length) return errs;
          await api.post(`${base}/refunds`, { amount, reason: f.reason!.trim() });
          done(
            a.refundIsManual ? 'Refund recorded — pay it and add the reference' : 'Refund started',
          );
        }}
      >
        {(e) => (
          <>
            <FormField
              label="Amount (₹)"
              required
              hint={`Up to ${formatINR(a.refundable)}`}
              error={e.amount}
            >
              <Input {...field('amount')} inputMode="decimal" />
            </FormField>
            <FormField label="Reason" required error={e.reason}>
              <Input {...field('reason')} maxLength={300} />
            </FormField>
          </>
        )}
      </FormDialog>

      <FormDialog
        open={open?.kind === 'manual'}
        onClose={close}
        title="Record refund payment"
        description={
          open?.kind === 'manual'
            ? `Enter the reference of the ${formatINR(open.amount)} bank transfer or UPI payment.`
            : undefined
        }
        submitLabel="Mark as refunded"
        onSubmit={async () => {
          if (open?.kind !== 'manual') return;
          if ((f.reference ?? '').trim().length < 4)
            return { reference: 'Enter the transaction reference' };
          await api.post(`/admin/refunds/${open.refundId}/complete`, {
            reference: f.reference!.trim(),
          });
          done('Refund completed');
        }}
      >
        {(e) => (
          <FormField label="UTR / UPI reference" required error={e.reference}>
            <Input {...field('reference')} maxLength={60} spellCheck={false} />
          </FormField>
        )}
      </FormDialog>

      <FormDialog
        open={open?.kind === 'return'}
        onClose={close}
        title={open?.kind === 'return' ? RETURN_ACTION[open.action].title : ''}
        description={open?.kind === 'return' ? RETURN_ACTION[open.action].description : undefined}
        submitLabel={open?.kind === 'return' ? RETURN_ACTION[open.action].label : 'Save'}
        danger={open?.kind === 'return' && open.action === 'reject'}
        onSubmit={async () => {
          if (open?.kind !== 'return') return;
          if (open.action === 'reject' && (f.note ?? '').trim().length < 3)
            return { note: 'Tell the customer why' };
          await api.post(`/admin/returns/${open.id}`, {
            action: open.action,
            note: f.note?.trim() || undefined,
            restock,
          });
          done('Return request updated');
        }}
      >
        {(e) => (
          <>
            <FormField
              label={
                open?.kind === 'return' && open.action === 'reject' ? 'Reason' : 'Note (optional)'
              }
              required={open?.kind === 'return' && open.action === 'reject'}
              hint="The customer sees this"
              error={e.note}
            >
              <Textarea {...field('note')} rows={2} maxLength={500} />
            </FormField>
            {open?.kind === 'return' && open.action === 'receive' && (
              <Checkbox
                label="Put the items back into stock"
                description="Untick if they’re damaged and can’t be sold"
                checked={restock}
                onChange={(ev) => setRestock(ev.target.checked)}
              />
            )}
          </>
        )}
      </FormDialog>
    </section>
  );
}
