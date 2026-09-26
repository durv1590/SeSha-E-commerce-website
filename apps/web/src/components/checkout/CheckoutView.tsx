'use client';

import type { AddressDto, CheckoutQuoteDto, MeDto, PlaceOrderResultDto } from '@seshakart/types';
import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  FormField,
  Input,
  Skeleton,
  Textarea,
  buttonVariants,
  cn,
  formatINR,
} from '@seshakart/ui';
import { checkoutAddressSchema, emailSchema, indianMobileSchema } from '@seshakart/validation';
import { Lock, ShieldCheck, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { api, hasSession } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { refreshCartState } from '@/lib/cart/store';
import { saveOrderToken } from '@/lib/checkout/order-tokens';
import { ProductImage } from '../cards/ProductImage';
import { AddressFields, EMPTY_ADDRESS, type AddressValues } from './AddressFields';
import { usePayment } from './usePayment';

type Delivery = 'STANDARD' | 'EXPRESS';
type Payment = 'PREPAID' | 'COD';
type Errors = Record<string, string>;

const contactSchema = z.object({ email: emailSchema, phone: indianMobileSchema });

function newKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function issuesToErrors(prefix: string, issues: z.ZodIssue[]): Errors {
  const out: Errors = {};
  for (const i of issues) out[`${prefix}.${String(i.path[0])}`] ??= i.message;
  return out;
}

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={`step-${step}`}
      className="rounded-card border border-border bg-surface p-4 sm:p-6"
    >
      <h2 id={`step-${step}`} className="flex items-center gap-3 text-h4">
        <span
          aria-hidden="true"
          className="grid size-7 place-items-center rounded-full bg-primary text-small font-bold text-text-inverse"
        >
          {step}
        </span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * One-page checkout for guests and signed-in customers: contact, delivery address,
 * billing, delivery speed, payment, and a live order summary. The server prices every
 * choice; placing the order sends the total the shopper saw so nothing changes silently.
 */
export function CheckoutView() {
  const router = useRouter();
  const { run, dialog } = usePayment();
  const [user, setUser] = useState<MeDto | null | undefined>(undefined);
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [contact, setContact] = useState({ email: '', phone: '' });
  const [choice, setChoice] = useState<string>('new');
  const [shipping, setShipping] = useState<AddressValues>(EMPTY_ADDRESS);
  const [saveAddress, setSaveAddress] = useState(true);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<AddressValues>(EMPTY_ADDRESS);
  const [delivery, setDelivery] = useState<Delivery>('STANDARD');
  const [payment, setPayment] = useState<Payment>('PREPAID');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<ReactNode>(null);
  const [placing, setPlacing] = useState(false);
  const key = useRef<string>('');
  const formRef = useRef<HTMLFormElement>(null);

  // Who is checking out.
  useEffect(() => {
    if (!hasSession()) return setUser(null);
    api.get<MeDto>('/auth/me').then(
      async (me) => {
        setUser(me);
        setContact({ email: me.email ?? '', phone: me.phone ?? '' });
        const book = await api.get<AddressDto[]>('/users/me/addresses').catch(() => []);
        setAddresses(book);
        const preferred = book.find((a) => a.isDefault) ?? book[0];
        if (preferred) setChoice(preferred.id);
      },
      () => setUser(null),
    );
  }, []);

  // The delivery PIN code decides express and cash-on-delivery availability.
  const pincode =
    choice === 'new'
      ? /^[1-9]\d{5}$/.test(shipping.pincode)
        ? shipping.pincode
        : undefined
      : addresses.find((a) => a.id === choice)?.pincode;

  const loadQuote = useCallback(async (d: Delivery, p: Payment, pin?: string) => {
    setQuoting(true);
    try {
      setQuote(
        await api.post<CheckoutQuoteDto>('/checkout/quote', {
          deliveryMethod: d,
          paymentMethod: p,
          ...(pin ? { pincode: pin } : {}),
        }),
      );
      setQuoteError(null);
    } catch (err) {
      setQuoteError(err instanceof ApiError ? err.message : 'We couldn’t load your order summary.');
    } finally {
      setQuoting(false);
    }
  }, []);

  useEffect(() => {
    void loadQuote(delivery, payment, pincode);
  }, [delivery, payment, pincode, loadQuote]);

  // Express isn't offered everywhere (e.g. remote PIN codes): fall back to standard.
  useEffect(() => {
    const express = quote?.deliveryOptions.find((o) => o.method === 'EXPRESS');
    if (delivery === 'EXPRESS' && express && !express.available) setDelivery('STANDARD');
  }, [quote, delivery]);

  // If the chosen payment method stops being available (e.g. COD limit), fall back.
  useEffect(() => {
    const cod = quote?.paymentOptions.find((o) => o.method === 'COD');
    if (payment === 'COD' && cod && !cod.available) setPayment('PREPAID');
  }, [quote, payment]);

  const setField =
    (setter: (fn: (v: AddressValues) => AddressValues) => void, prefix: string) =>
    (name: keyof AddressValues, value: string) => {
      setter((v) => ({ ...v, [name]: value }));
      setErrors((e) => ({ ...e, [`${prefix}.${name}`]: '' }));
      setFormError(null);
    };

  const validate = (): Errors => {
    let errs: Errors = {};
    const c = contactSchema.safeParse(contact);
    if (!c.success) errs = { ...errs, ...issuesToErrors('contact', c.error.issues) };
    if (choice === 'new') {
      const a = checkoutAddressSchema.safeParse(shipping);
      if (!a.success) errs = { ...errs, ...issuesToErrors('shipping', a.error.issues) };
    }
    if (!billingSame) {
      const b = checkoutAddressSchema.safeParse(billing);
      if (!b.success) errs = { ...errs, ...issuesToErrors('billing', b.error.issues) };
    }
    return errs;
  };

  const focusFirst = (errs: Errors) => {
    const first = Object.keys(errs).find((k) => errs[k]);
    if (first)
      requestAnimationFrame(() =>
        formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(),
      );
  };

  const cartLink = (
    <Link href="/cart" className="font-semibold">
      Review your cart
    </Link>
  );

  const placeOrder = async () => {
    if (!quote) return;
    setFormError(null);
    const errs = validate();
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      setFormError('Please check the highlighted details.');
      return focusFirst(errs);
    }
    key.current ||= newKey();
    setPlacing(true);
    try {
      const result = await api.post<PlaceOrderResultDto>('/checkout/orders', {
        contact,
        ...(choice === 'new'
          ? {
              shippingAddress: checkoutAddressSchema.parse(shipping),
              saveAddress: Boolean(user) && saveAddress,
            }
          : { shippingAddressId: choice }),
        billingSameAsShipping: billingSame,
        ...(billingSame ? {} : { billingAddress: checkoutAddressSchema.parse(billing) }),
        deliveryMethod: delivery,
        paymentMethod: payment,
        expectedTotal: quote.totals.total,
        idempotencyKey: key.current,
        notes: notes || undefined,
      });
      if (result.guestAccessToken) saveOrderToken(result.orderNumber, result.guestAccessToken);
      refreshCartState();
      key.current = '';
      const success = `/checkout/success?order=${result.orderNumber}`;
      if (!result.payment) return router.replace(success);
      const outcome = await run(result.payment);
      router.replace(outcome === 'paid' ? success : `/checkout/failed?order=${result.orderNumber}`);
    } catch (err) {
      setPlacing(false);
      if (!(err instanceof ApiError))
        return setFormError('Something went wrong. Please try again.');
      // A definitive answer: the next attempt is a new request.
      if (err.status !== 0 && err.status < 500) key.current = '';
      if (
        err.code === 'VALIDATION_FAILED' ||
        err.code === 'CONTACT_REQUIRED' ||
        (err.code === 'NOT_SERVICEABLE' && choice === 'new')
      ) {
        const mapped: Errors = {};
        for (const [path, message] of Object.entries(err.fieldErrors()))
          mapped[
            path.replace(/^shippingAddress\./, 'shipping.').replace(/^billingAddress\./, 'billing.')
          ] = message;
        setErrors(mapped);
        focusFirst(mapped);
        return setFormError(err.message);
      }
      if (err.code === 'PRICE_CHANGED') {
        await loadQuote(delivery, payment, pincode);
        return setFormError(<>{err.message} The summary has been updated.</>);
      }
      if (
        ['CART_NEEDS_ATTENTION', 'INSUFFICIENT_STOCK', 'CART_EMPTY', 'COUPON_INVALID'].includes(
          err.code,
        )
      ) {
        await loadQuote(delivery, payment, pincode);
        return setFormError(
          <>
            {err.message} {cartLink}
          </>,
        );
      }
      setFormError(err.message);
    }
  };

  if (quoteError && !quote)
    return (
      <Alert variant="error" title="Checkout couldn’t load">
        {quoteError}
      </Alert>
    );
  if (!quote || user === undefined) return <CheckoutSkeleton />;
  if (!quote.cart.items.length)
    return (
      <EmptyState
        icon={<ShoppingCart size={28} aria-hidden="true" />}
        title="Your cart is empty"
        description="Add something to your cart to check out."
        action={
          <Link href="/deals" className={buttonVariants({ variant: 'primary' })}>
            Shop deals
          </Link>
        }
      />
    );

  const { totals } = quote;
  const saved = totals.productDiscount + totals.couponDiscount;
  const payLabel =
    payment === 'PREPAID'
      ? `Pay ${formatINR(totals.total)} securely`
      : `Place order · ${formatINR(totals.total)}`;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void placeOrder();
      }}
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-8"
    >
      {dialog}
      <div className="flex min-w-0 flex-col gap-4">
        {!quote.cart.canCheckout && (
          <Alert variant="warning" title="Some items need your attention">
            Items in your cart changed. {cartLink} before placing the order.
          </Alert>
        )}

        <Section step={1} title="Contact details">
          {user ? (
            <p className="mb-4 text-small text-text-secondary">
              Signed in as <strong className="text-text-primary">{user.name}</strong>
            </p>
          ) : (
            <p className="mb-4 text-small text-text-secondary">
              Checking out as a guest.{' '}
              <Link href="/login?next=/checkout" className="font-semibold">
                Sign in
              </Link>{' '}
              for faster checkout with your saved addresses.
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
            <FormField
              label="Email"
              hint="We’ll send your order confirmation here"
              error={errors['contact.email']}
              required
            >
              <Input
                name="contact.email"
                type="email"
                autoComplete="email"
                value={contact.email}
                onChange={(e) => {
                  setContact((c) => ({ ...c, email: e.target.value }));
                  setErrors((x) => ({ ...x, 'contact.email': '' }));
                  setFormError(null);
                }}
              />
            </FormField>
            <FormField label="Mobile number" error={errors['contact.phone']} required>
              <Input
                name="contact.phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14}
                value={contact.phone}
                onChange={(e) => {
                  setContact((c) => ({ ...c, phone: e.target.value }));
                  setErrors((x) => ({ ...x, 'contact.phone': '' }));
                  setFormError(null);
                }}
              />
            </FormField>
          </div>
        </Section>

        <Section step={2} title="Delivery address">
          {addresses.length > 0 && (
            <fieldset className="mb-2">
              <legend className="sr-only">Choose a delivery address</legend>
              <div className="flex flex-col gap-2">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-md border p-3',
                      choice === a.id ? 'border-primary bg-primary-light' : 'border-border',
                    )}
                  >
                    <input
                      type="radio"
                      name="addressChoice"
                      checked={choice === a.id}
                      onChange={() => setChoice(a.id)}
                      className="mt-1 size-5 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 text-small">
                      <span className="block font-semibold text-body">
                        {a.name} <span className="font-normal text-text-muted">· {a.phone}</span>
                      </span>
                      {[a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`]
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </label>
                ))}
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md border p-3',
                    choice === 'new' ? 'border-primary bg-primary-light' : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    name="addressChoice"
                    checked={choice === 'new'}
                    onChange={() => setChoice('new')}
                    className="size-5 shrink-0 accent-primary"
                  />
                  <span className="font-semibold">Deliver to a new address</span>
                </label>
              </div>
            </fieldset>
          )}
          {choice === 'new' && (
            <div className={cn(addresses.length > 0 && 'mt-4')}>
              <AddressFields
                section="shipping"
                values={shipping}
                onChange={setField(setShipping, 'shipping')}
                errors={Object.fromEntries(
                  Object.entries(errors)
                    .filter(([k]) => k.startsWith('shipping.'))
                    .map(([k, v]) => [k.slice(9), v]),
                )}
              />
              {user && (
                <Checkbox
                  className="mt-2"
                  label="Save this address to my address book"
                  checked={saveAddress}
                  onChange={(e) => setSaveAddress(e.target.checked)}
                />
              )}
            </div>
          )}
          <Checkbox
            className="mt-2"
            label="Billing address is the same as the delivery address"
            checked={billingSame}
            onChange={(e) => setBillingSame(e.target.checked)}
          />
          {!billingSame && (
            <div className="mt-2 border-t border-border pt-4">
              <h3 className="mb-3 text-h5">Billing address</h3>
              <AddressFields
                section="billing"
                values={billing}
                onChange={setField(setBilling, 'billing')}
                errors={Object.fromEntries(
                  Object.entries(errors)
                    .filter(([k]) => k.startsWith('billing.'))
                    .map(([k, v]) => [k.slice(8), v]),
                )}
              />
            </div>
          )}
        </Section>

        <Section step={3} title="Delivery speed">
          <fieldset>
            <legend className="sr-only">Choose delivery speed</legend>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
              {quote.deliveryOptions
                .filter((o) => o.available)
                .map((o) => (
                  <OptionCard
                    key={o.method}
                    name="delivery"
                    checked={delivery === o.method}
                    onSelect={() => setDelivery(o.method)}
                    title={o.label}
                    detail={o.estimate}
                    price={o.fee ? formatINR(o.fee) : 'Free'}
                  />
                ))}
            </div>
          </fieldset>
        </Section>

        <Section step={4} title="Payment">
          <fieldset>
            <legend className="sr-only">Choose how to pay</legend>
            <div className="flex flex-col gap-2">
              {quote.paymentOptions.map((o) => (
                <OptionCard
                  key={o.method}
                  name="payment"
                  checked={payment === o.method}
                  disabled={!o.available}
                  onSelect={() => setPayment(o.method)}
                  title={o.label}
                  detail={o.available ? o.description : (o.reason ?? 'Not available')}
                  price={o.fee ? `+ ${formatINR(o.fee)}` : undefined}
                />
              ))}
            </div>
          </fieldset>
          <p className="mt-3 flex items-start gap-2 text-caption text-text-muted">
            <ShieldCheck
              size={16}
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-success-text"
            />
            Online payments are processed securely by our payment partner. SeShaKart never sees or
            stores your card or UPI details.
          </p>
          <FormField
            label="Delivery instructions"
            hint="Optional, up to 300 characters"
            className="mt-4"
          >
            <Textarea
              name="notes"
              rows={2}
              maxLength={300}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </Section>
      </div>

      <aside aria-labelledby="checkout-summary" className="lg:sticky lg:top-40 lg:self-start">
        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5">
          <h2 id="checkout-summary" className="text-h4">
            Order summary
          </h2>
          <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {quote.cart.items.map((l) => (
              <li
                key={l.id}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 text-small"
              >
                <ProductImage
                  image={l.image}
                  sizes="56px"
                  className="rounded-sm border border-border"
                />
                <span className="min-w-0">
                  <span className="line-clamp-2 font-medium">{l.name}</span>
                  <span className="text-text-muted">
                    {l.variantName ? `${l.variantName} · ` : ''}Qty {l.quantity}
                  </span>
                </span>
                <span className="font-medium tabular-nums">{formatINR(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-2 border-t border-border pt-3 text-body">
            <Row
              label={`Price (${totals.itemCount} ${totals.itemCount === 1 ? 'item' : 'items'})`}
              value={formatINR(totals.mrpTotal)}
            />
            {totals.productDiscount > 0 && (
              <Row label="Discount" value={`− ${formatINR(totals.productDiscount)}`} save />
            )}
            {totals.couponDiscount > 0 && (
              <Row
                label={`Coupon (${quote.cart.coupon?.code})`}
                value={`− ${formatINR(totals.couponDiscount)}`}
                save
              />
            )}
            <Row
              label="Delivery"
              value={totals.shippingFee ? formatINR(totals.shippingFee) : 'Free'}
              save={!totals.shippingFee}
            />
            {totals.codFee > 0 && (
              <Row label="Cash on delivery fee" value={formatINR(totals.codFee)} />
            )}
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
              <dt className="font-heading text-h5">Total</dt>
              <dd className="font-heading text-h4 tabular-nums" aria-live="polite">
                {formatINR(totals.total)}
              </dd>
            </div>
          </dl>
          <p className="-mt-2 text-caption text-text-muted">
            Inclusive of {formatINR(totals.taxIncluded)} GST.
          </p>
          {saved > 0 && (
            <p className="rounded-md bg-success-light px-3 py-2 text-small font-semibold text-success-text">
              You save {formatINR(saved)} on this order
            </p>
          )}
          {formError && (
            <Alert variant="error" className="text-small">
              {formError}
            </Alert>
          )}
          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={placing}
            loadingText="Placing your order…"
            // The total shown must match the current choices before it can be confirmed.
            disabled={!quote.canPlaceOrder || quoting}
          >
            <Lock size={18} aria-hidden="true" />
            {payLabel}
          </Button>
          <p className="text-caption text-text-muted">
            By placing your order you agree to SeShaKart’s terms of sale, returns and privacy
            policy.
          </p>
        </div>
      </aside>
    </form>
  );
}

function Row({ label, value, save }: { label: string; value: string; save?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={cn('font-medium tabular-nums', save && 'text-success-text')}>{value}</dd>
    </div>
  );
}

function OptionCard({
  name,
  checked,
  disabled,
  onSelect,
  title,
  detail,
  price,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
  price?: string;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-3 rounded-md border p-3',
        disabled ? 'cursor-not-allowed border-border bg-surface-muted' : 'cursor-pointer',
        checked && !disabled
          ? 'border-primary bg-primary-light'
          : !disabled && 'border-border hover:border-primary',
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-1 size-5 shrink-0 accent-primary"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline justify-between gap-3">
          <span className={cn('font-semibold', disabled && 'text-text-muted')}>{title}</span>
          {price && <span className="shrink-0 text-small font-semibold tabular-nums">{price}</span>}
        </span>
        <span className="text-small text-text-secondary">{detail}</span>
      </span>
    </label>
  );
}

function CheckoutSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading checkout"
      className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]"
    >
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-card" />
        ))}
      </div>
      <Skeleton className="h-96 w-full rounded-card" />
    </div>
  );
}
