import { describe, expect, it } from 'vitest';
import { addCartItemSchema, applyCouponSchema, updateCartItemSchema } from './cart';

describe('cart schemas', () => {
  it('defaults the quantity to 1 and bounds it', () => {
    expect(addCartItemSchema.parse({ variantId: 'abc123' })).toEqual({
      variantId: 'abc123',
      quantity: 1,
    });
    expect(addCartItemSchema.safeParse({ variantId: 'abc123', quantity: 0 }).success).toBe(false);
    expect(addCartItemSchema.safeParse({ variantId: 'abc123', quantity: 100 }).success).toBe(false);
    expect(addCartItemSchema.safeParse({ variantId: 'x; drop', quantity: 1 }).success).toBe(false);
  });

  it('strips client-sent prices', () => {
    expect(addCartItemSchema.parse({ variantId: 'abc123', price: 1, total: 1 })).toEqual({
      variantId: 'abc123',
      quantity: 1,
    });
  });

  it('requires something to update', () => {
    expect(updateCartItemSchema.safeParse({}).success).toBe(false);
    expect(updateCartItemSchema.parse({ savedForLater: true })).toEqual({ savedForLater: true });
  });

  it('normalises coupon codes to upper case and rejects odd input', () => {
    expect(applyCouponSchema.parse({ code: ' welcome10 ' })).toEqual({ code: 'WELCOME10' });
    for (const code of ['ab', 'SAVE 10', "X'; --", 'A'.repeat(33)])
      expect(applyCouponSchema.safeParse({ code }).success).toBe(false);
  });
});
