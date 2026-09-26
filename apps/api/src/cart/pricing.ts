import type { CouponType } from '@prisma/client';

/**
 * Pure pricing: cart totals, coupon rules and GST. No I/O, so the cart and checkout
 * (Phase 8) compute identical numbers, and every rule is unit-tested. All amounts are
 * integer paise; prices are GST-inclusive (GST is reported, never added on top).
 */

export interface PricingLine {
  /** Stable key (cart item id) used for per-line allocations. */
  key: string;
  productId: string;
  /** The product's category and all its ancestors (for category-restricted coupons). */
  categoryPath: string[];
  unitPrice: number;
  unitMrp: number;
  quantity: number;
  /** GST rate in percent, e.g. 18. */
  taxRate: number;
}

export interface CouponRules {
  code: string;
  description: string | null;
  type: CouponType;
  /** PERCENTAGE: 1..100. FIXED: paise. */
  value: number;
  maxDiscount: number | null;
  minCartValue: number;
  startsAt: Date | null;
  endsAt: Date | null;
  usageLimit: number | null;
  usedCount: number;
  usagePerUser: number;
  firstOrderOnly: boolean;
  productIds: string[];
  categoryIds: string[];
  customerIds: string[];
  isActive: boolean;
}

export interface CouponContext {
  now: Date;
  /** Null for guests: user-bound rules then need a sign-in. */
  userId: string | null;
  /** Orders the customer has placed before (not cancelled). */
  previousOrders: number;
  /** Times this customer has already used this coupon. */
  timesUsedByUser: number;
}

export type CouponRejection =
  | 'INVALID'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'SIGN_IN_REQUIRED'
  | 'NOT_ELIGIBLE'
  | 'FIRST_ORDER_ONLY'
  | 'ALREADY_USED'
  | 'NOT_APPLICABLE'
  | 'BELOW_MINIMUM'
  | 'EMPTY_CART';

export type CouponEvaluation =
  | { ok: true; discount: number; allocations: Map<string, number> }
  | { ok: false; reason: CouponRejection; message: string };

export interface ShippingRules {
  freeShippingThreshold: number;
  standardShippingFee: number;
}

export interface PricingResult {
  itemCount: number;
  mrpTotal: number;
  subtotal: number;
  productDiscount: number;
  couponDiscount: number;
  shippingFee: number;
  taxIncluded: number;
  total: number;
  freeShippingRemaining: number;
  /** Per-line coupon allocation and included GST (for order lines and invoices). */
  lines: Map<string, { discount: number; tax: number }>;
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

const lineTotal = (l: PricingLine) => l.unitPrice * l.quantity;

/**
 * Splits `amount` across lines in proportion to their weights, so the parts add up
 * exactly (largest-remainder method; ties go to the earlier line).
 */
export function allocate(amount: number, weights: [string, number][]): Map<string, number> {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  const out = new Map<string, number>();
  if (total <= 0 || amount <= 0) {
    weights.forEach(([k]) => out.set(k, 0));
    return out;
  }
  const exact = weights.map(([k, w], i) => ({ k, i, v: (amount * w) / total }));
  let given = 0;
  for (const e of exact) {
    const floor = Math.floor(e.v);
    out.set(e.k, floor);
    given += floor;
  }
  const byRemainder = [...exact].sort(
    (a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || a.i - b.i,
  );
  for (let r = amount - given, j = 0; r > 0; r--, j++) {
    const e = byRemainder[j % byRemainder.length]!;
    out.set(e.k, out.get(e.k)! + 1);
  }
  return out;
}

const reject = (reason: CouponRejection, message: string): CouponEvaluation => ({
  ok: false,
  reason,
  message,
});

/** Applies every coupon rule. Messages are safe to show to customers. */
export function evaluateCoupon(
  coupon: CouponRules,
  lines: PricingLine[],
  ctx: CouponContext,
): CouponEvaluation {
  if (!coupon.isActive) return reject('INVALID', 'This coupon code isn’t valid.');
  if (coupon.startsAt && coupon.startsAt > ctx.now)
    return reject('NOT_STARTED', 'This coupon isn’t active yet.');
  if (coupon.endsAt && coupon.endsAt < ctx.now)
    return reject('EXPIRED', 'This coupon has expired.');
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    return reject('EXHAUSTED', 'This coupon has reached its usage limit.');

  const userBound = coupon.customerIds.length > 0 || coupon.firstOrderOnly;
  if (userBound && !ctx.userId) return reject('SIGN_IN_REQUIRED', 'Sign in to use this coupon.');
  if (coupon.customerIds.length && !coupon.customerIds.includes(ctx.userId!))
    return reject('NOT_ELIGIBLE', 'This coupon isn’t available on your account.');
  if (coupon.firstOrderOnly && ctx.previousOrders > 0)
    return reject('FIRST_ORDER_ONLY', 'This coupon is only for your first order.');
  if (ctx.userId && ctx.timesUsedByUser >= coupon.usagePerUser)
    return reject('ALREADY_USED', 'You’ve already used this coupon.');

  if (!lines.length) return reject('EMPTY_CART', 'Add items to your cart to use a coupon.');
  const restricted = coupon.productIds.length > 0 || coupon.categoryIds.length > 0;
  const eligible = lines.filter(
    (l) =>
      !restricted ||
      coupon.productIds.includes(l.productId) ||
      l.categoryPath.some((c) => coupon.categoryIds.includes(c)),
  );
  const eligibleTotal = eligible.reduce((s, l) => s + lineTotal(l), 0);
  if (eligibleTotal === 0)
    return reject('NOT_APPLICABLE', 'This coupon doesn’t apply to the items in your cart.');

  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  if (subtotal < coupon.minCartValue)
    return reject(
      'BELOW_MINIMUM',
      `Add ${formatRupees(coupon.minCartValue - subtotal)} more to use this coupon (minimum order ${formatRupees(coupon.minCartValue)}).`,
    );

  let discount =
    coupon.type === 'PERCENTAGE' ? Math.floor((eligibleTotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.max(0, Math.min(discount, eligibleTotal));
  return {
    ok: true,
    discount,
    allocations: allocate(
      discount,
      eligible.map((l) => [l.key, lineTotal(l)]),
    ),
  };
}

/** GST contained in a GST-inclusive amount, rounded to the paisa. */
export function includedTax(amount: number, ratePercent: number): number {
  return ratePercent > 0 ? Math.round((amount * ratePercent) / (100 + ratePercent)) : 0;
}

/** Totals for the purchasable lines, with an already-evaluated coupon (or none). */
export function priceCart(
  lines: PricingLine[],
  coupon: Extract<CouponEvaluation, { ok: true }> | null,
  shipping: ShippingRules,
): PricingResult {
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  const mrpTotal = lines.reduce((s, l) => s + l.unitMrp * l.quantity, 0);
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const couponDiscount = coupon?.discount ?? 0;
  const payable = subtotal - couponDiscount;
  const free = payable >= shipping.freeShippingThreshold;
  const shippingFee = itemCount === 0 || free ? 0 : shipping.standardShippingFee;

  const perLine = new Map<string, { discount: number; tax: number }>();
  let taxIncluded = 0;
  for (const l of lines) {
    const discount = coupon?.allocations.get(l.key) ?? 0;
    const tax = includedTax(lineTotal(l) - discount, l.taxRate);
    perLine.set(l.key, { discount, tax });
    taxIncluded += tax;
  }
  return {
    itemCount,
    mrpTotal,
    subtotal,
    productDiscount: mrpTotal - subtotal,
    couponDiscount,
    shippingFee,
    taxIncluded,
    total: payable + shippingFee,
    freeShippingRemaining: itemCount === 0 || free ? 0 : shipping.freeShippingThreshold - payable,
    lines: perLine,
  };
}
