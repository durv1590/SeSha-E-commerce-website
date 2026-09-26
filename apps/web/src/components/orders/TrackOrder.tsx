'use client';

import type { TrackOrderDto } from '@seshakart/types';
import { Alert, Button, FormField, Input } from '@seshakart/ui';
import { orderNumberSchema, trackOrderSchema } from '@seshakart/validation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { hasSession } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { ordersApi } from '@/lib/orders/api';
import { deliveryWindow, longDate } from '@/lib/orders/format';
import { OrderStatusBadge } from './OrderStatusBadge';
import { OrderTimeline } from './OrderTimeline';
import { ShipmentCard } from './ShipmentCard';

export function TrackOrder() {
  const params = useSearchParams();
  const initial = orderNumberSchema.safeParse(params.get('order') ?? '');
  const [orderNumber, setOrderNumber] = useState(initial.success ? initial.data : '');
  const [contact, setContact] = useState('');
  const [errors, setErrors] = useState<{ orderNumber?: string; contact?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackOrderDto | null>(null);
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = trackOrderSchema.safeParse({ orderNumber, contact });
    if (!parsed.success) {
      const errs: typeof errors = {};
      for (const i of parsed.error.issues) errs[i.path[0] as keyof typeof errors] ??= i.message;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      setResult(await ordersApi.track(parsed.data.orderNumber, parsed.data.contact));
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form
        onSubmit={submit}
        noValidate
        className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 sm:p-6"
      >
        <FormField
          label="Order number"
          hint="For example SK260926001042"
          error={errors.orderNumber}
          required
        >
          <Input
            name="orderNumber"
            value={orderNumber}
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
          />
        </FormField>
        <FormField label="Email or mobile number" error={errors.contact} required>
          <Input
            name="contact"
            value={contact}
            autoComplete="email"
            onChange={(e) => setContact(e.target.value)}
          />
        </FormField>
        {error && (
          <Alert variant="error" className="sm:col-span-2">
            {error}
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" loading={busy} loadingText="Looking it up…">
            Track order
          </Button>
          {hasSession() && (
            <Link href="/account/orders" className="text-small font-semibold">
              See all your orders
            </Link>
          )}
        </div>
      </form>

      {result && (
        <div
          ref={resultRef}
          tabIndex={-1}
          className="mt-6 flex flex-col gap-4 rounded-card border border-border bg-surface p-4 outline-none sm:p-6"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-h4">
                Order <span className="font-mono">{result.orderNumber}</span>
              </h2>
              <p className="text-small text-text-muted">
                Placed {longDate(result.placedAt)} · {result.itemCount}{' '}
                {result.itemCount === 1 ? 'item' : 'items'} · to {result.deliveryCity}
              </p>
            </div>
            <OrderStatusBadge status={result.status} label={result.statusLabel} />
          </div>
          {['CANCELLED', 'REFUNDED', 'REFUND_INITIATED'].includes(result.status) ? null : (
            <OrderTimeline steps={result.timeline} />
          )}
          {result.estimatedDelivery && (
            <p className="rounded-md bg-primary-light px-3 py-2 text-small font-semibold">
              Arriving {deliveryWindow(result.estimatedDelivery)}
            </p>
          )}
          {result.shipments.map((s, i) => (
            <ShipmentCard key={i} shipment={s} />
          ))}
        </div>
      )}
    </>
  );
}
