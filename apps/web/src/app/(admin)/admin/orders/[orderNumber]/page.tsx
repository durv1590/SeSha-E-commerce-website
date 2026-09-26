import type { AdminOrderDto, OrderAddressDto } from '@seshakart/types';
import { Badge, buttonVariants, cn, formatINR } from '@seshakart/ui';
import { FileDown } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { OrderActions } from '@/components/admin/ops/OrderActions';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { ShipmentCard } from '@/components/orders/ShipmentCard';
import { ApiError } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { dateTime, deliveryWindow, longDate } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Order' };

function Card({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        'flex flex-col gap-3 rounded-card border border-border bg-surface p-4',
        className,
      )}
    >
      <h2 id={id} className="text-h5">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Address({ a }: { a: OrderAddressDto }) {
  return (
    <address className="text-small not-italic text-text-secondary">
      <span className="font-medium text-text-primary">{a.name}</span>, {a.phone}
      <br />
      {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}
      <br />
      {a.city}, {a.state} {a.pincode}
    </address>
  );
}

const REFUND_TONE = { PENDING: 'warning', PROCESSED: 'success', FAILED: 'error' } as const;

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber: raw } = await params;
  const orderNumber = raw.toUpperCase();
  const user = await requireStaff(`/admin/orders/${raw}`, 'orders:read');
  if (!/^SK\d{10,16}$/.test(orderNumber)) notFound();
  const { data: o } = await serverApi<AdminOrderDto>(`/admin/orders/${orderNumber}`).catch(
    (err) => {
      if (err instanceof ApiError && err.status === 404) notFound();
      throw err;
    },
  );
  const t = o.totals;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link href="/admin/orders" className="self-start text-small font-medium text-primary-dark">
          ← All orders
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-h3">{o.orderNumber}</h1>
            <OrderStatusBadge status={o.status} label={o.statusLabel} />
          </div>
          {o.invoice && (
            <a
              href={`/api/admin/orders/${o.orderNumber}/invoice`}
              download
              className={buttonVariants({ variant: 'outline', size: 'md' })}
            >
              <FileDown size={16} aria-hidden="true" /> Invoice {o.invoice.number}
            </a>
          )}
        </div>
        <p className="text-small text-text-muted">
          Placed {dateTime(o.placedAt)} ·{' '}
          {o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'} ·{' '}
          {o.deliveryMethod === 'EXPRESS' ? 'Express delivery' : 'Standard delivery'}
          {o.estimatedDelivery && ` · Expected ${deliveryWindow(o.estimatedDelivery)}`}
          {o.cancelReason && ` · Cancelled: ${o.cancelReason}`}
        </p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <aside
          aria-label="Order details"
          className="flex flex-col gap-5 xl:col-start-2 xl:row-start-1"
        >
          <OrderActions order={o} permissions={user.permissions} />

          <Card id="cust-h" title="Customer">
            <p className="text-small">
              {o.customer ? (
                user.permissions.includes('customers:read') ? (
                  <Link
                    href={`/admin/customers/${o.customer.id}`}
                    className="font-medium text-primary-dark"
                  >
                    {o.customer.name}
                  </Link>
                ) : (
                  <span className="font-medium">{o.customer.name}</span>
                )
              ) : (
                <span className="font-medium">Guest checkout</span>
              )}
              {o.customer && (
                <span className="text-text-muted">
                  {' '}
                  · {o.customer.orderCount} order{o.customer.orderCount === 1 ? '' : 's'}
                  {o.customer.status === 'SUSPENDED' && ' · suspended'}
                </span>
              )}
              <br />
              <a href={`mailto:${o.email}`} className="text-text-secondary">
                {o.email}
              </a>
              <br />
              <a href={`tel:+91${o.phone}`} className="text-text-secondary">
                +91 {o.phone}
              </a>
            </p>
            <div>
              <h3 className="text-small font-semibold">Delivery address</h3>
              <Address a={o.shippingAddress} />
            </div>
            {JSON.stringify(o.billingAddress) !== JSON.stringify(o.shippingAddress) &&
              o.billingAddress?.name && (
                <div>
                  <h3 className="text-small font-semibold">Billing address</h3>
                  <Address a={o.billingAddress} />
                </div>
              )}
          </Card>

          <Card id="pay-h" title="Payments and refunds">
            {o.payments.length === 0 && (
              <p className="text-small text-text-muted">
                {o.paymentMethod === 'COD'
                  ? `${formatINR(t.grandTotal)} to collect in cash on delivery.`
                  : 'No payment recorded.'}
              </p>
            )}
            <ul className="flex flex-col gap-2 text-small">
              {o.payments.map((p, i) => (
                <li key={i}>
                  <span className="font-medium tabular-nums">{formatINR(p.amount)}</span>{' '}
                  <span className="text-text-secondary">
                    {p.provider === 'cod'
                      ? 'Cash on delivery'
                      : `${p.provider}${p.method ? ` · ${p.method}` : ''}`}{' '}
                    · {p.status.replace(/_/g, ' ').toLowerCase()}
                  </span>
                  {p.reference && (
                    <span className="block font-mono text-caption text-text-muted">
                      {p.reference}
                    </span>
                  )}
                  {p.error && <span className="block text-caption text-error-text">{p.error}</span>}
                </li>
              ))}
            </ul>
            {o.staffRefunds.length > 0 && (
              <ul className="flex flex-col gap-2 border-t border-border pt-3 text-small">
                {o.staffRefunds.map((r) => (
                  <li key={r.id}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">Refund {formatINR(r.amount)}</span>
                      <Badge variant={REFUND_TONE[r.status]}>{r.status.toLowerCase()}</Badge>
                    </span>
                    <span className="block text-caption text-text-muted">
                      {longDate(r.createdAt)}
                      {r.actor && ` · by ${r.actor}`}
                      {r.manual && ' · bank/UPI'}
                      {r.reference && ` · ref ${r.reference}`}
                    </span>
                    {r.reason && (
                      <span className="block text-caption text-text-secondary">{r.reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
        <div className="flex flex-col gap-5 xl:col-start-1 xl:row-start-1">
          <Card id="items-h" title={`Items (${o.items.reduce((s, i) => s + i.quantity, 0)})`}>
            <ul className="flex flex-col divide-y divide-border">
              {o.items.map((i) => (
                <li
                  key={i.id}
                  className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
                >
                  <span className="relative block size-12 overflow-hidden rounded-sm border border-border bg-surface">
                    {i.imageUrl && (
                      <Image
                        src={i.imageUrl}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-contain p-0.5"
                      />
                    )}
                  </span>
                  <span className="min-w-0 text-small">
                    <span className="line-clamp-2 font-medium">{i.name}</span>
                    <span className="text-text-muted">
                      {i.variantName ? `${i.variantName} · ` : ''}
                      <span className="font-mono">{i.sku}</span> · {formatINR(i.unitPrice)} ×{' '}
                      {i.quantity}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{formatINR(i.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="flex flex-col gap-1 border-t border-border pt-3 text-small">
              {[
                ['Items', formatINR(t.subtotal)],
                ...(t.couponDiscount
                  ? [[`Coupon ${o.couponCode ?? ''}`, `− ${formatINR(t.couponDiscount)}`]]
                  : []),
                ['Delivery', t.shippingFee ? formatINR(t.shippingFee) : 'Free'],
                ...(t.codFee ? [['Cash on delivery fee', formatINR(t.codFee)]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-text-secondary">{k}</dt>
                  <dd className="tabular-nums">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-border pt-1.5 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatINR(t.grandTotal)}</dd>
              </div>
            </dl>
            <p className="text-caption text-text-muted">Includes {formatINR(t.taxTotal)} GST.</p>
          </Card>

          {o.shipments.length > 0 && (
            <Card id="ship-h" title="Shipments">
              {o.shipments.map((s, i) => (
                <ShipmentCard key={`${s.carrier}-${s.trackingNumber}-${i}`} shipment={s} />
              ))}
            </Card>
          )}

          {o.returns.length > 0 && (
            <Card id="ret-h" title="Returns and replacements">
              <ul className="flex flex-col gap-3">
                {o.returns.map((r) => (
                  <li key={r.id} className="rounded-md border border-border p-3 text-small">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {r.type === 'RETURN' ? 'Return' : 'Replacement'}
                      <Badge
                        variant={
                          r.status === 'REJECTED'
                            ? 'neutral'
                            : r.status === 'COMPLETED'
                              ? 'success'
                              : 'warning'
                        }
                      >
                        {r.statusLabel}
                      </Badge>
                      <span className="font-normal text-text-muted">{dateTime(r.createdAt)}</span>
                    </p>
                    <p className="mt-1 text-text-secondary">
                      Reason: {r.reason.replace(/_/g, ' ').toLowerCase()}
                      {r.comments && ` — “${r.comments}”`}
                    </p>
                    <p className="text-text-secondary">
                      {r.items
                        .map(
                          (i) =>
                            `${i.quantity} × ${i.name}${i.variantName ? ` (${i.variantName})` : ''}`,
                        )
                        .join('; ')}
                    </p>
                    {r.resolutionNote && (
                      <p className="text-text-secondary">Note: {r.resolutionNote}</p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card id="hist-h" title="History">
            <ol className="flex flex-col gap-2 text-small">
              {[...o.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{h.toLabel}</span>
                  <span className="text-text-muted">{dateTime(h.at)}</span>
                  <span className="text-text-secondary">
                    {h.actor ? `by ${h.actor}` : 'automatic'}
                    {h.note ? ` — ${h.note}` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
}
