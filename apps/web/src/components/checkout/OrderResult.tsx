'use client';

import { ORDER_STATUS_LABELS, type OrderSummaryDto } from '@seshakart/types';
import { Alert, Button, Skeleton, buttonVariants, cn, formatINR } from '@seshakart/ui';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasSession } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { orderApi } from '@/lib/checkout/api';
import { usePayment } from './usePayment';

const POLL_MS = 2_500;
const MAX_POLLS = 8;

function timeLeft(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60_000));
  return mins <= 1 ? 'about a minute' : `${mins} minutes`;
}

/**
 * Order confirmation (`mode="success"`) and payment-failed (`mode="failed"`) pages.
 * Reads the order live: a payment that is still being confirmed is polled briefly,
 * and a failed one can be retried while the stock is still held.
 */
export function OrderResult({ mode }: { mode: 'success' | 'failed' }) {
  const params = useSearchParams();
  const router = useRouter();
  const orderNumber = (params.get('order') ?? '').toUpperCase();
  const { run, dialog } = usePayment();
  const [order, setOrder] = useState<OrderSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const polls = useRef(0);

  const load = useCallback(async () => {
    try {
      setOrder(await orderApi.get(orderNumber));
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'We couldn’t find this order in this browser. Check your confirmation email or sign in to see your orders.'
          : 'We couldn’t load your order. Please refresh the page.',
      );
    }
  }, [orderNumber]);

  useEffect(() => {
    if (!/^SK\d{10,16}$/.test(orderNumber)) {
      setError('This link is missing an order number.');
      return;
    }
    void load();
  }, [orderNumber, load]);

  // Payment reported by the browser, confirmation still on its way (webhook): poll.
  useEffect(() => {
    if (mode !== 'success' || order?.status !== 'PAYMENT_PENDING' || polls.current >= MAX_POLLS)
      return;
    const t = setTimeout(() => {
      polls.current += 1;
      void load();
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [mode, order, load]);

  const retry = async () => {
    setRetrying(true);
    try {
      const { payment, order: fresh } = await orderApi.retry(orderNumber);
      setOrder(fresh);
      const outcome = payment ? await run(payment) : 'paid';
      if (outcome === 'paid') router.replace(`/checkout/success?order=${orderNumber}`);
      else await load();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'We couldn’t start the payment. Please try again.',
      );
      await load();
    } finally {
      setRetrying(false);
    }
  };

  if (error && !order)
    return (
      <Alert variant="error" title="Order not available">
        {error}
      </Alert>
    );
  if (!order)
    return <Skeleton className="h-96 w-full rounded-card" aria-label="Loading your order" />;

  const confirmed = [
    'CONFIRMED',
    'PROCESSING',
    'PACKED',
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
  ].includes(order.status);
  const pending = order.status === 'PAYMENT_PENDING';
  const cancelled = order.status === 'CANCELLED';
  const a = order.shippingAddress;

  let heading: { icon: typeof CircleCheck; tone: string; title: string; text: string };
  if (confirmed)
    heading = {
      icon: CircleCheck,
      tone: 'text-success-text bg-success-light',
      title: 'Thank you! Your order is confirmed',
      text:
        order.paymentMethod === 'COD'
          ? `Please keep ${formatINR(order.totals.grandTotal)} ready to pay on delivery (cash or UPI).`
          : 'We’ve received your payment. A confirmation has been sent to your email.',
    };
  else if (pending && mode === 'success')
    heading = {
      icon: Clock,
      tone: 'text-primary bg-primary-light',
      title: 'Confirming your payment…',
      text: 'This usually takes a few seconds. You don’t need to pay again. If money was deducted, it will be confirmed or refunded automatically.',
    };
  else if (pending)
    heading = {
      icon: CircleAlert,
      tone: 'text-warning-text bg-warning-light',
      title: 'Your payment didn’t go through',
      text: `No money was taken for this attempt. Your items are held for ${timeLeft(order.reservationExpiresAt) ?? 'a short while'}, so you can try again.`,
    };
  else
    heading = {
      icon: CircleAlert,
      tone: 'text-error-text bg-error-light',
      title: cancelled ? 'This order was cancelled' : ORDER_STATUS_LABELS[order.status],
      text: cancelled
        ? 'Payment wasn’t completed in time, so the items were released. If money was deducted, it will be refunded automatically.'
        : 'Here is the latest status of your order.',
    };
  const Icon = heading.icon;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {dialog}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className={cn('grid size-16 place-items-center rounded-full', heading.tone)}>
          <Icon size={32} aria-hidden="true" />
        </span>
        <h1 className="text-h2" aria-live="polite">
          {heading.title}
        </h1>
        <p className="max-w-xl text-text-secondary">{heading.text}</p>
        <p className="text-small">
          Order number <strong className="font-mono text-body">{order.orderNumber}</strong>
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex flex-wrap justify-center gap-3">
        {pending && order.canRetryPayment && mode === 'failed' && (
          <Button size="lg" loading={retrying} loadingText="Opening payment…" onClick={retry}>
            Try payment again · {formatINR(order.totals.grandTotal)}
          </Button>
        )}
        <Link
          href="/"
          className={buttonVariants({
            variant: pending && mode === 'failed' ? 'outline' : 'primary',
            size: 'lg',
          })}
        >
          Continue shopping
        </Link>
        {hasSession() && (confirmed || cancelled) && (
          <Link
            href={`/account/orders/${order.orderNumber}`}
            className={buttonVariants({ variant: 'outline', size: 'lg' })}
          >
            View order details
          </Link>
        )}
      </div>

      <section
        aria-labelledby="order-items"
        className="rounded-card border border-border bg-surface p-4 sm:p-6"
      >
        <h2 id="order-items" className="text-h4">
          Order details
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {order.items.map((i) => (
            <li
              key={`${i.sku}-${i.name}`}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3"
            >
              <span className="relative block size-14 overflow-hidden rounded-sm border border-border bg-surface">
                {i.imageUrl && (
                  <Image src={i.imageUrl} alt="" fill sizes="56px" className="object-contain p-1" />
                )}
              </span>
              <span className="min-w-0 text-small">
                <span className="line-clamp-2 font-medium text-body">{i.name}</span>
                <span className="text-text-muted">
                  {i.variantName ? `${i.variantName} · ` : ''}Qty {i.quantity}
                </span>
              </span>
              <span className="font-medium tabular-nums">{formatINR(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 text-small">
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
          <div className="mt-1 flex justify-between border-t border-border pt-2 text-body font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatINR(order.totals.grandTotal)}</dd>
          </div>
        </dl>
        <p className="mt-1 text-caption text-text-muted">
          Inclusive of {formatINR(order.totals.taxTotal)} GST.
        </p>
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 border-t border-border pt-4 text-small sm:grid-cols-2">
          <div>
            <h3 className="font-semibold">Delivering to</h3>
            <p className="mt-1 text-text-secondary">
              {a.name}, {a.phone}
              <br />
              {[a.line1, a.line2, a.landmark].filter(Boolean).join(', ')}
              <br />
              {a.city}, {a.state} {a.pincode}
            </p>
          </div>
          <div>
            <h3 className="font-semibold">Payment and delivery</h3>
            <p className="mt-1 text-text-secondary">
              {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}
              <br />
              {order.deliveryMethod === 'EXPRESS'
                ? 'Express delivery (1–3 business days)'
                : 'Standard delivery (3–6 business days)'}
              <br />
              Updates go to {order.email}
            </p>
          </div>
        </div>
      </section>
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
