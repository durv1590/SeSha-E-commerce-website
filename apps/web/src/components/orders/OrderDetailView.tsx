'use client';

import type { OrderDetailDto } from '@seshakart/types';
import { Alert, Badge, Button, buttonVariants, cn, formatINR, useToast } from '@seshakart/ui';
import { Download, PackageX, RotateCcw } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { ordersApi } from '@/lib/orders/api';
import { deliveryWindow, longDate } from '@/lib/orders/format';
import { CancelOrderDialog } from './CancelOrderDialog';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderTimeline } from './OrderTimeline';
import { ReturnRequestDialog } from './ReturnRequestDialog';
import { ShipmentCard } from './ShipmentCard';

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = `sec-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section
      aria-labelledby={id}
      className={cn('rounded-card border border-border bg-surface p-4 sm:p-6', className)}
    >
      <h2 id={id} className="text-h4">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** One order: progress, tracking, items, returns, refunds, invoice and actions. */
export function OrderDetailView({ initial }: { initial: OrderDetailDto }) {
  const [order, setOrder] = useState(initial);
  const [dialog, setDialog] = useState<'cancel' | 'return' | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [announce, setAnnounce] = useState('');
  const { toast } = useToast();
  const a = order.shippingAddress;
  const closed =
    ['CANCELLED', 'REFUND_INITIATED', 'REFUNDED'].includes(order.status) && !order.deliveredAt;

  const download = async () => {
    setDownloading(true);
    try {
      await ordersApi.downloadInvoice(order.orderNumber);
    } catch (err) {
      toast({
        variant: 'error',
        title: err instanceof ApiError ? err.message : 'We couldn’t download the invoice.',
      });
    } finally {
      setDownloading(false);
    }
  };

  const updated = (o: OrderDetailDto, message: string) => {
    setOrder(o);
    setDialog(null);
    setAnnounce(message);
    toast({ variant: 'success', title: message });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h2">
            Order <span className="font-mono">{order.orderNumber}</span>
          </h1>
          <p className="mt-1 text-small text-text-muted">
            Placed on {longDate(order.placedAt)} · {formatINR(order.totals.grandTotal)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} label={order.statusLabel} />
      </div>

      <div className="flex flex-wrap gap-2">
        {order.invoice && (
          <Button
            variant="outline"
            size="sm"
            loading={downloading}
            loadingText="Preparing…"
            onClick={download}
          >
            <Download size={16} aria-hidden="true" />
            Download invoice
          </Button>
        )}
        {order.canRequestReturn && (
          <Button variant="outline" size="sm" onClick={() => setDialog('return')}>
            <RotateCcw size={16} aria-hidden="true" />
            Return or replace
          </Button>
        )}
        {order.canRetryPayment && (
          <Link
            href={`/checkout/failed?order=${order.orderNumber}`}
            className={buttonVariants({ size: 'sm' })}
          >
            Complete payment
          </Link>
        )}
        {order.canCancel && (
          <Button variant="ghost" size="sm" onClick={() => setDialog('cancel')}>
            <PackageX size={16} aria-hidden="true" />
            Cancel order
          </Button>
        )}
      </div>

      {closed ? (
        <Alert variant={order.status === 'REFUNDED' ? 'success' : 'info'} title={order.statusLabel}>
          {order.cancelledAt ? `Cancelled on ${longDate(order.cancelledAt)}. ` : ''}
          {order.cancelReason ? `Reason: ${order.cancelReason}.` : ''}
        </Alert>
      ) : (
        <Section title="Order progress">
          <OrderTimeline steps={order.timeline} />
          {order.estimatedDelivery && (
            <p className="mt-4 rounded-md bg-primary-light px-3 py-2 text-small">
              <strong>Arriving {deliveryWindow(order.estimatedDelivery)}</strong>
            </p>
          )}
          {order.deliveredAt && (
            <p className="mt-4 text-small text-text-secondary">
              Delivered on {longDate(order.deliveredAt)}.
              {order.canRequestReturn && order.returnDeadline
                ? ` Returns and replacements are open until ${longDate(order.returnDeadline)} for eligible items.`
                : order.returns.length === 0
                  ? ' The items in this order aren’t eligible for return or replacement, or the return window has closed.'
                  : ''}
            </p>
          )}
        </Section>
      )}

      {order.shipments.length > 0 && (
        <Section title="Tracking">
          <div className="flex flex-col gap-3">
            {order.shipments.map((s, i) => (
              <ShipmentCard key={`${s.trackingNumber}-${i}`} shipment={s} />
            ))}
          </div>
        </Section>
      )}

      {order.returns.length > 0 && (
        <Section title="Returns and replacements">
          <ul className="flex flex-col gap-3">
            {order.returns.map((r) => (
              <li key={r.id} className="rounded-md border border-border p-4 text-small">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {r.type === 'RETURN' ? 'Return' : 'Replacement'} · {longDate(r.createdAt)}
                  </p>
                  <Badge
                    variant={
                      r.status === 'REJECTED'
                        ? 'error'
                        : r.status === 'COMPLETED'
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {r.statusLabel}
                  </Badge>
                </div>
                <p className="mt-1 text-text-secondary">
                  {r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')} · {r.reason}
                </p>
                {r.resolutionNote && <p className="mt-1">{r.resolutionNote}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {order.refunds.length > 0 && (
        <Section title="Refunds">
          <ul className="flex flex-col gap-2 text-small">
            {order.refunds.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {formatINR(r.amount)} · {longDate(r.processedAt ?? r.createdAt)}
                  {r.reason ? ` · ${r.reason}` : ''}
                </span>
                <Badge
                  variant={
                    r.status === 'PROCESSED'
                      ? 'success'
                      : r.status === 'FAILED'
                        ? 'error'
                        : 'warning'
                  }
                >
                  {r.statusLabel}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-caption text-text-muted">
            {order.paymentMethod === 'COD'
              ? 'Refunds for cash-on-delivery orders are sent to your bank account or UPI ID.'
              : 'Refunds go back to your original payment method; banks usually take 5–7 working days.'}
          </p>
        </Section>
      )}

      <Section title="Items">
        <ul className="flex flex-col divide-y divide-border">
          {order.items.map((i) => (
            <li
              key={i.id}
              className="grid grid-cols-[4rem_minmax(0,1fr)_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <span className="relative block size-16 overflow-hidden rounded-sm border border-border bg-surface">
                {i.imageUrl && (
                  <Image src={i.imageUrl} alt="" fill sizes="64px" className="object-contain p-1" />
                )}
              </span>
              <span className="min-w-0 text-small">
                {i.slug ? (
                  <Link
                    href={`/product/${i.slug}`}
                    className="line-clamp-2 font-semibold text-body text-text-primary no-underline hover:text-primary"
                  >
                    {i.name}
                  </Link>
                ) : (
                  <span className="line-clamp-2 font-semibold text-body">{i.name}</span>
                )}
                <span className="text-text-muted">
                  {i.variantName ? `${i.variantName} · ` : ''}Qty {i.quantity} ·{' '}
                  {formatINR(i.unitPrice)} each
                </span>
              </span>
              <span className="font-medium tabular-nums">{formatINR(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Section title="Delivery and payment">
          <div className="flex flex-col gap-3 text-small">
            <p>
              <span className="font-semibold">Delivering to</span>
              <br />
              {a.name}, {a.phone}
              <br />
              {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}
              <br />
              {a.city}, {a.state} {a.pincode}
            </p>
            <p>
              <span className="font-semibold">Payment</span>
              <br />
              {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'} ·{' '}
              {order.deliveryMethod === 'EXPRESS' ? 'Express delivery' : 'Standard delivery'}
            </p>
            <p className="text-text-muted">Updates are sent to {order.email}</p>
          </div>
        </Section>
        <Section title="Price details">
          <dl className="flex flex-col gap-2 text-small">
            <Line label="Items" value={formatINR(order.totals.subtotal)} />
            {order.totals.couponDiscount > 0 && (
              <Line
                label={`Coupon (${order.couponCode})`}
                value={`− ${formatINR(order.totals.couponDiscount)}`}
              />
            )}
            <Line
              label="Delivery"
              value={order.totals.shippingFee ? formatINR(order.totals.shippingFee) : 'Free'}
            />
            {order.totals.codFee > 0 && (
              <Line label="Cash on delivery fee" value={formatINR(order.totals.codFee)} />
            )}
            <div className="flex justify-between border-t border-border pt-2 text-body font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatINR(order.totals.grandTotal)}</dd>
            </div>
          </dl>
          <p className="mt-1 text-caption text-text-muted">
            Inclusive of {formatINR(order.totals.taxTotal)} GST.
          </p>
          {order.invoice && (
            <p className="mt-2 text-caption text-text-muted">
              Invoice {order.invoice.number} · {longDate(order.invoice.date)}
            </p>
          )}
        </Section>
      </div>

      {dialog === 'cancel' && (
        <CancelOrderDialog
          order={order}
          onClose={() => setDialog(null)}
          onDone={(o) => updated(o, 'Your order has been cancelled.')}
        />
      )}
      {dialog === 'return' && (
        <ReturnRequestDialog
          order={order}
          onClose={() => setDialog(null)}
          onDone={(o) => updated(o, 'Your request has been sent.')}
        />
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
