import {
  allocate,
  evaluateCoupon,
  includedTax,
  priceCart,
  type CouponContext,
  type CouponRules,
  type PricingLine,
} from './pricing';

const line = (key: string, unitPrice: number, quantity = 1, extra: Partial<PricingLine> = {}) =>
  ({
    key,
    productId: `p-${key}`,
    categoryPath: ['cat-root', `cat-${key}`],
    unitPrice,
    unitMrp: unitPrice * 2,
    quantity,
    taxRate: 18,
    ...extra,
  }) satisfies PricingLine;

const coupon = (extra: Partial<CouponRules> = {}): CouponRules => ({
  code: 'SAVE10',
  description: null,
  type: 'PERCENTAGE',
  value: 10,
  maxDiscount: null,
  minCartValue: 0,
  startsAt: null,
  endsAt: null,
  usageLimit: null,
  usedCount: 0,
  usagePerUser: 1,
  firstOrderOnly: false,
  productIds: [],
  categoryIds: [],
  customerIds: [],
  isActive: true,
  ...extra,
});

const now = new Date('2026-09-26T10:00:00Z');
const guest: CouponContext = { now, userId: null, previousOrders: 0, timesUsedByUser: 0 };
const member: CouponContext = { now, userId: 'u1', previousOrders: 2, timesUsedByUser: 0 };
const shipping = { freeShippingThreshold: 49_900, standardShippingFee: 4_900 };

describe('allocate', () => {
  it('splits exactly in proportion, remainders to the largest fractions', () => {
    const parts = allocate(100, [
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
    expect([...parts.values()]).toEqual([34, 33, 33]);
    expect([
      ...allocate(999, [
        ['a', 3],
        ['b', 7],
      ]).values(),
    ]).toEqual([300, 699]);
    expect([...allocate(0, [['a', 1]]).values()]).toEqual([0]);
  });
});

describe('evaluateCoupon', () => {
  const cart = [line('a', 30_000), line('b', 20_000, 2)]; // subtotal ₹700

  it('applies a percentage discount across the whole cart, capped by maxDiscount', () => {
    const r = evaluateCoupon(coupon(), cart, guest);
    expect(r).toMatchObject({ ok: true, discount: 7_000 });
    const capped = evaluateCoupon(coupon({ maxDiscount: 5_000 }), cart, guest);
    expect(capped).toMatchObject({ ok: true, discount: 5_000 });
    if (capped.ok) expect([...capped.allocations.values()].reduce((s, v) => s + v, 0)).toBe(5_000);
  });

  it('never discounts more than the eligible amount for fixed coupons', () => {
    const r = evaluateCoupon(coupon({ type: 'FIXED', value: 1_000_000 }), cart, guest);
    expect(r).toMatchObject({ ok: true, discount: 70_000 });
  });

  it('restricts to products or categories (including ancestor categories)', () => {
    const byProduct = evaluateCoupon(coupon({ productIds: ['p-b'] }), cart, guest);
    expect(byProduct).toMatchObject({ ok: true, discount: 4_000 });
    if (byProduct.ok) expect(byProduct.allocations.get('a')).toBeUndefined();
    expect(evaluateCoupon(coupon({ categoryIds: ['cat-a'] }), cart, guest)).toMatchObject({
      discount: 3_000,
    });
    expect(evaluateCoupon(coupon({ categoryIds: ['cat-root'] }), cart, guest)).toMatchObject({
      discount: 7_000,
    });
    expect(evaluateCoupon(coupon({ productIds: ['other'] }), cart, guest)).toMatchObject({
      ok: false,
      reason: 'NOT_APPLICABLE',
    });
  });

  it('enforces dates, activity and the global usage limit', () => {
    const past = new Date('2026-01-01');
    const future = new Date('2027-01-01');
    expect(evaluateCoupon(coupon({ isActive: false }), cart, guest)).toMatchObject({
      reason: 'INVALID',
    });
    expect(evaluateCoupon(coupon({ startsAt: future }), cart, guest)).toMatchObject({
      reason: 'NOT_STARTED',
    });
    expect(evaluateCoupon(coupon({ endsAt: past }), cart, guest)).toMatchObject({
      reason: 'EXPIRED',
    });
    expect(evaluateCoupon(coupon({ usageLimit: 5, usedCount: 5 }), cart, guest)).toMatchObject({
      reason: 'EXHAUSTED',
    });
    expect(
      evaluateCoupon(
        coupon({ startsAt: past, endsAt: future, usageLimit: 5, usedCount: 4 }),
        cart,
        guest,
      ),
    ).toMatchObject({ ok: true });
  });

  it('enforces the minimum cart value with a helpful message', () => {
    const r = evaluateCoupon(coupon({ minCartValue: 99_900 }), cart, guest);
    expect(r).toMatchObject({ ok: false, reason: 'BELOW_MINIMUM' });
    if (!r.ok) expect(r.message).toContain('₹299');
  });

  it('handles first-order, customer-specific and per-customer limits', () => {
    expect(evaluateCoupon(coupon({ firstOrderOnly: true }), cart, guest)).toMatchObject({
      reason: 'SIGN_IN_REQUIRED',
    });
    expect(evaluateCoupon(coupon({ firstOrderOnly: true }), cart, member)).toMatchObject({
      reason: 'FIRST_ORDER_ONLY',
    });
    expect(
      evaluateCoupon(coupon({ firstOrderOnly: true }), cart, { ...member, previousOrders: 0 }),
    ).toMatchObject({ ok: true });
    expect(evaluateCoupon(coupon({ customerIds: ['u2'] }), cart, member)).toMatchObject({
      reason: 'NOT_ELIGIBLE',
    });
    expect(evaluateCoupon(coupon({ customerIds: ['u1'] }), cart, member)).toMatchObject({
      ok: true,
    });
    expect(
      evaluateCoupon(coupon({ usagePerUser: 2 }), cart, { ...member, timesUsedByUser: 2 }),
    ).toMatchObject({ reason: 'ALREADY_USED' });
  });

  it('rejects an empty cart', () => {
    expect(evaluateCoupon(coupon(), [], guest)).toMatchObject({ reason: 'EMPTY_CART' });
  });
});

describe('priceCart', () => {
  it('totals MRP, savings, shipping and included GST', () => {
    const r = priceCart([line('a', 11_800, 2)], null, shipping); // ₹236
    expect(r).toMatchObject({
      itemCount: 2,
      mrpTotal: 47_200,
      subtotal: 23_600,
      productDiscount: 23_600,
      couponDiscount: 0,
      shippingFee: 4_900,
      taxIncluded: 3_600, // 18% GST inside ₹236 = ₹36
      total: 28_500,
      freeShippingRemaining: 26_300,
    });
  });

  it('ships free at the threshold, measured after the coupon', () => {
    const lines = [line('a', 50_000)];
    expect(priceCart(lines, null, shipping)).toMatchObject({ shippingFee: 0, total: 50_000 });
    const c = evaluateCoupon(coupon(), lines, guest);
    if (!c.ok) throw new Error('expected ok');
    const r = priceCart(lines, c, shipping);
    expect(r).toMatchObject({ couponDiscount: 5_000, shippingFee: 4_900, total: 49_900 });
    expect(r.freeShippingRemaining).toBe(4_900);
  });

  it('computes GST on the discounted line amount, per rate', () => {
    const lines = [line('a', 11_800), line('b', 10_500, 1, { taxRate: 5 })];
    const c = evaluateCoupon(coupon({ productIds: ['p-a'] }), lines, guest);
    if (!c.ok) throw new Error('expected ok');
    const r = priceCart(lines, c, shipping);
    expect(r.lines.get('a')).toEqual({ discount: 1_180, tax: includedTax(10_620, 18) });
    expect(r.lines.get('b')).toEqual({ discount: 0, tax: 500 });
    expect(r.taxIncluded).toBe(includedTax(10_620, 18) + 500);
  });

  it('charges nothing for an empty cart', () => {
    expect(priceCart([], null, shipping)).toMatchObject({
      total: 0,
      shippingFee: 0,
      freeShippingRemaining: 0,
    });
  });
});
