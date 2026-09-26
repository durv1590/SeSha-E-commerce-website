'use client';

import type { CartDto, CartLineDto } from '@seshakart/types';
import {
  Alert,
  Button,
  EmptyState,
  Input,
  Price,
  QuantityStepper,
  Skeleton,
  StockBadge,
  buttonVariants,
  cn,
  formatINR,
  useToast,
} from '@seshakart/ui';
import { BadgePercent, ShoppingCart, Tag, Truck, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, hasSession } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { addToCart, cartChanged } from '@/lib/cart/store';
import { ProductImage } from '../cards/ProductImage';

const ISSUE_TEXT: Record<NonNullable<CartLineDto['issue']>, (l: CartLineDto) => string> = {
  UNAVAILABLE: () => 'This item is no longer available. Remove it to continue.',
  OUT_OF_STOCK: () => 'Out of stock. Save it for later or remove it to continue.',
  INSUFFICIENT_STOCK: (l) => `Only ${l.maxQuantity} available. Reduce the quantity to continue.`,
};

/**
 * The cart. Everything shown (prices, stock, coupon, delivery, GST, total) comes from
 * the API on every change; the browser only sends which line changed and how.
 */
export function CartView() {
  const { toast } = useToast();
  const [cart, setCart] = useState<CartDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const apply = useCallback((next: CartDto, message?: string) => {
    setCart(next);
    cartChanged(next);
    if (message) setAnnouncement(message);
  }, []);

  useEffect(() => {
    api
      .get<CartDto>('/cart')
      .then((c) => apply(c))
      .catch((err: unknown) =>
        setLoadError(err instanceof ApiError ? err.message : 'We couldn’t load your cart.'),
      );
  }, [apply]);

  /** Runs a cart change for one line, keeping the UI consistent on failure. */
  const run = async (key: string, fn: () => Promise<CartDto>, message: string) => {
    setPending(key);
    try {
      apply(await fn(), message);
    } catch (err) {
      toast({
        variant: 'error',
        title: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      });
      // Resync: the cart may have changed underneath us (stock, another tab).
      api.get<CartDto>('/cart').then(
        (c) => apply(c),
        () => undefined,
      );
    } finally {
      setPending(null);
    }
  };

  const update = (
    line: CartLineDto,
    body: { quantity?: number; savedForLater?: boolean },
    message: string,
  ) => run(line.id, () => api.patch<CartDto>(`/cart/items/${line.id}`, body), message);

  const remove = (line: CartLineDto) =>
    run(line.id, () => api.delete<CartDto>(`/cart/items/${line.id}`), `${line.name} removed.`).then(
      () =>
        toast({
          title: 'Item removed',
          description: line.name,
          action: line.savedForLater
            ? undefined
            : {
                label: 'Undo',
                onClick: () =>
                  void run(
                    `undo-${line.id}`,
                    () =>
                      addToCart(
                        line.variantId,
                        Math.min(line.quantity, Math.max(1, line.maxQuantity)),
                      ),
                    `${line.name} added back.`,
                  ),
              },
        }),
    );

  if (loadError) {
    return (
      <Alert variant="error" title="Your cart couldn’t be loaded">
        {loadError}{' '}
        <button type="button" className="font-semibold underline" onClick={() => location.reload()}>
          Try again
        </button>
      </Alert>
    );
  }
  if (!cart) return <CartSkeleton />;

  const { items, savedForLater, totals } = cart;
  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <h1 className="text-h1">
        Shopping cart{' '}
        {totals.itemCount > 0 && (
          <span className="font-body text-h4 font-normal text-text-muted">
            ({totals.itemCount} {totals.itemCount === 1 ? 'item' : 'items'})
          </span>
        )}
      </h1>

      {items.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<ShoppingCart size={28} aria-hidden="true" />}
          title="Your cart is empty"
          description={
            savedForLater.length
              ? 'Items you saved for later are below.'
              : 'Explore today’s deals and add something you love.'
          }
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Link href="/deals" className={buttonVariants({ variant: 'primary' })}>
                Shop deals
              </Link>
              {hasSession() ? (
                <Link href="/account/wishlist" className={buttonVariants({ variant: 'outline' })}>
                  View wishlist
                </Link>
              ) : (
                <Link href="/login?next=/cart" className={buttonVariants({ variant: 'outline' })}>
                  Sign in to see your cart
                </Link>
              )}
            </div>
          }
        />
      ) : (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
          <section aria-labelledby="cart-items">
            <h2 id="cart-items" className="sr-only">
              Items in your cart
            </h2>
            {!hasSession() && (
              <p className="mb-4 rounded-card border border-border bg-primary-light px-4 py-3 text-small">
                <Link href="/login?next=/cart" className="font-semibold text-primary-dark">
                  Sign in
                </Link>{' '}
                to save your cart to your account and see it on all your devices.
              </p>
            )}
            <ul className="flex flex-col gap-3">
              {items.map((line) => (
                <CartLine
                  key={line.id}
                  line={line}
                  busy={pending === line.id}
                  onQuantity={(q) =>
                    update(line, { quantity: q }, `Quantity of ${line.name} set to ${q}.`)
                  }
                  onSave={() =>
                    update(line, { savedForLater: true }, `${line.name} saved for later.`)
                  }
                  onRemove={() => remove(line)}
                />
              ))}
            </ul>
          </section>

          <Summary cart={cart} apply={apply} />
        </div>
      )}

      {savedForLater.length > 0 && (
        <section aria-labelledby="saved-for-later" className="mt-10">
          <h2 id="saved-for-later" className="text-h3">
            Saved for later ({savedForLater.length})
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {savedForLater.map((line) => (
              <CartLine
                key={line.id}
                line={line}
                busy={pending === line.id}
                onMove={() => update(line, { savedForLater: false }, `${line.name} moved to cart.`)}
                onRemove={() => remove(line)}
              />
            ))}
          </ul>
        </section>
      )}

      {items.length > 0 && <MobileCheckoutBar cart={cart} />}
    </>
  );
}

function CartLine({
  line,
  busy,
  onQuantity,
  onSave,
  onMove,
  onRemove,
}: {
  line: CartLineDto;
  busy: boolean;
  onQuantity?: (q: number) => void;
  onSave?: () => void;
  onMove?: () => void;
  onRemove: () => void;
}) {
  const href = `/product/${line.slug}`;
  const blocked = line.issue === 'UNAVAILABLE' || line.issue === 'OUT_OF_STOCK';
  const action =
    'min-h-touch text-small font-semibold text-primary hover:underline disabled:opacity-50';
  return (
    <li
      className={cn(
        'grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 rounded-card border bg-surface p-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4 sm:p-4',
        line.issue && !line.savedForLater ? 'border-warning' : 'border-border',
        busy && 'opacity-70',
      )}
      aria-busy={busy || undefined}
    >
      <Link href={href} tabIndex={-1} aria-hidden="true" className="block">
        <ProductImage
          image={line.image}
          sizes="112px"
          className={cn('rounded-sm border border-border', blocked && 'opacity-60')}
        />
      </Link>
      <div className="flex min-w-0 flex-col gap-1.5">
        <Link
          href={href}
          className="line-clamp-2 font-semibold text-text-primary no-underline hover:text-primary"
        >
          {line.name}
        </Link>
        {line.variantName && <p className="text-small text-text-secondary">{line.variantName}</p>}
        <Price price={line.price} mrp={line.mrp} size="sm" />
        {line.stock === 'low_stock' && !line.issue && (
          <StockBadge state="low_stock" available={line.maxQuantity} className="self-start" />
        )}
        {line.issue && !line.savedForLater && (
          <p className="text-small font-medium text-warning-text">{ISSUE_TEXT[line.issue](line)}</p>
        )}
        {line.savedForLater && blocked && (
          <p className="text-small text-text-muted">
            {line.issue === 'UNAVAILABLE' ? 'No longer available' : 'Currently out of stock'}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
          {onQuantity && !blocked && (
            <QuantityStepper
              size="sm"
              value={line.quantity}
              max={Math.max(line.maxQuantity, line.quantity)}
              disabled={busy}
              itemLabel={line.name}
              onChange={(q) => onQuantity(q)}
            />
          )}
          {line.issue === 'INSUFFICIENT_STOCK' && onQuantity && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onQuantity(line.maxQuantity)}
            >
              Update to {line.maxQuantity}
            </Button>
          )}
          {onSave && (
            <button type="button" className={action} disabled={busy} onClick={onSave}>
              Save for later
            </button>
          )}
          {onMove && !blocked && (
            <button type="button" className={action} disabled={busy} onClick={onMove}>
              Move to cart
            </button>
          )}
          <button
            type="button"
            className={cn(action, 'text-text-secondary')}
            disabled={busy}
            onClick={onRemove}
            aria-label={`Remove ${line.name}`}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'save' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-text-secondary">{label}</dt>
      <dd className={cn('font-medium tabular-nums', tone === 'save' && 'text-success-text')}>
        {value}
      </dd>
    </div>
  );
}

function Summary({ cart, apply }: { cart: CartDto; apply: (c: CartDto, m?: string) => void }) {
  const { totals, coupon } = cart;
  const saved = totals.productDiscount + totals.couponDiscount;
  const progress =
    totals.freeShippingThreshold > 0
      ? Math.min(
          100,
          Math.round(
            ((totals.freeShippingThreshold - totals.freeShippingRemaining) /
              totals.freeShippingThreshold) *
              100,
          ),
        )
      : 100;
  return (
    <aside aria-labelledby="order-summary" className="lg:sticky lg:top-40 lg:self-start">
      <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5">
        <h2 id="order-summary" className="text-h4">
          Price details
        </h2>

        {totals.freeShippingRemaining > 0 ? (
          <div className="flex flex-col gap-2 rounded-md bg-primary-light p-3 text-small">
            <p className="flex items-center gap-2">
              <Truck size={18} aria-hidden="true" className="shrink-0 text-primary" />
              <span>
                Add <strong>{formatINR(totals.freeShippingRemaining)}</strong> more for free
                delivery
              </span>
            </p>
            <div
              role="progressbar"
              aria-label="Progress towards free delivery"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
              className="h-1.5 overflow-hidden rounded-pill bg-surface"
            >
              <div className="h-full rounded-pill bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          totals.itemCount > 0 && (
            <p className="flex items-center gap-2 rounded-md bg-success-light p-3 text-small text-success-text">
              <Truck size={18} aria-hidden="true" className="shrink-0" />
              You get free delivery on this order
            </p>
          )
        )}

        <CouponForm cart={cart} apply={apply} />

        <dl className="flex flex-col gap-2 text-body">
          <Row
            label={`Price (${totals.itemCount} ${totals.itemCount === 1 ? 'item' : 'items'})`}
            value={formatINR(totals.mrpTotal)}
          />
          {totals.productDiscount > 0 && (
            <Row label="Discount" value={`− ${formatINR(totals.productDiscount)}`} tone="save" />
          )}
          {coupon?.valid && totals.couponDiscount > 0 && (
            <Row
              label={`Coupon (${coupon.code})`}
              value={`− ${formatINR(totals.couponDiscount)}`}
              tone="save"
            />
          )}
          <Row
            label="Delivery"
            value={totals.shippingFee ? formatINR(totals.shippingFee) : 'Free'}
            tone={totals.shippingFee ? undefined : 'save'}
          />
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-3">
            <dt className="font-heading text-h5">Total</dt>
            <dd className="font-heading text-h4 tabular-nums">{formatINR(totals.total)}</dd>
          </div>
        </dl>
        <p className="-mt-2 text-caption text-text-muted">
          Inclusive of {formatINR(totals.taxIncluded)} GST. Express delivery and payment options are
          chosen at checkout.
        </p>
        {saved > 0 && (
          <p className="rounded-md bg-success-light px-3 py-2 text-small font-semibold text-success-text">
            You save {formatINR(saved)} on this order
          </p>
        )}

        <CheckoutButton cart={cart} />
      </div>
    </aside>
  );
}

function CheckoutButton({ cart, className }: { cart: CartDto; className?: string }) {
  if (!cart.canCheckout) {
    return (
      <div className={cn('flex flex-col gap-2', className)}>
        <Button size="lg" fullWidth disabled>
          Proceed to checkout
        </Button>
        <p className="text-caption text-warning-text">
          Some items need your attention before you can check out.
        </p>
      </div>
    );
  }
  return (
    <Link
      href="/checkout"
      className={cn(buttonVariants({ size: 'lg', fullWidth: true }), className)}
    >
      Proceed to checkout
    </Link>
  );
}

function CouponForm({ cart, apply }: { cart: CartDto; apply: (c: CartDto, m?: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { coupon } = cart;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError('Enter a coupon code.');
    setBusy(true);
    setError(null);
    try {
      const next = await api.post<CartDto>('/cart/coupon', { code });
      apply(next, `Coupon ${next.coupon?.code} applied.`);
      setCode('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t apply the coupon.');
    } finally {
      setBusy(false);
    }
  };
  const removeCoupon = async () => {
    setBusy(true);
    try {
      apply(await api.delete<CartDto>('/cart/coupon'), 'Coupon removed.');
    } finally {
      setBusy(false);
    }
  };

  if (coupon) {
    return (
      <div
        className={cn(
          'flex items-start justify-between gap-3 rounded-md border border-dashed p-3 text-small',
          coupon.valid ? 'border-success bg-success-light' : 'border-warning bg-warning-light',
        )}
      >
        <div className="flex min-w-0 gap-2">
          <BadgePercent size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">
              {coupon.code}{' '}
              {coupon.valid ? (
                <span className="font-normal">applied · you save {formatINR(coupon.discount)}</span>
              ) : (
                <span className="font-normal">not applied</span>
              )}
            </p>
            {coupon.message && <p className="text-text-secondary">{coupon.message}</p>}
          </div>
        </div>
        <button
          type="button"
          onClick={removeCoupon}
          disabled={busy}
          aria-label={`Remove coupon ${coupon.code}`}
          className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
      <label htmlFor="coupon-code" className="flex items-center gap-1.5 text-small font-semibold">
        <Tag size={16} aria-hidden="true" />
        Have a coupon?
      </label>
      <div className="flex gap-2">
        <Input
          id="coupon-code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Enter code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'coupon-error' : undefined}
          className="min-w-0 flex-1 uppercase"
        />
        <Button type="submit" variant="outline" loading={busy}>
          Apply
        </Button>
      </div>
      {error && (
        <p id="coupon-error" role="alert" className="text-small text-error-text">
          {error}
        </p>
      )}
    </form>
  );
}

/** Phones: the total and checkout stay in reach while scrolling long carts. */
function MobileCheckoutBar({ cart }: { cart: CartDto }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface/95 px-gutter pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-lg backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-4">
        <div className="min-w-0">
          <p className="text-caption text-text-muted">Total</p>
          <p className="font-heading text-h4 tabular-nums">{formatINR(cart.totals.total)}</p>
        </div>
        <CheckoutButton cart={cart} className="ml-auto max-w-60 flex-1" />
      </div>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your cart">
      <Skeleton className="h-10 w-64" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-card" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-card" />
      </div>
    </div>
  );
}
