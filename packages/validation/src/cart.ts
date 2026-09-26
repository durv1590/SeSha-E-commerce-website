import { z } from 'zod';

/** Database ids (cuid). Loose on purpose: unknown ids simply aren't found. */
export const idSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+$/i, 'Invalid id');

/** Absolute ceiling; the admin-set `maxQuantityPerItem` usually applies first. */
export const MAX_CART_QUANTITY = 99;
/** Distinct lines a cart may hold (cart + saved for later). */
export const MAX_CART_LINES = 50;

const quantitySchema = z.number().int().min(1).max(MAX_CART_QUANTITY);

export const addCartItemSchema = z.object({
  variantId: idSchema,
  quantity: quantitySchema.default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z
  .object({ quantity: quantitySchema.optional(), savedForLater: z.boolean().optional() })
  .refine((v) => v.quantity !== undefined || v.savedForLater !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

/** Coupon codes are case-insensitive and stored upper-case. */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, 'Enter a valid coupon code');

export const applyCouponSchema = z.object({ code: couponCodeSchema });
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

export const addWishlistItemSchema = z.object({ productId: idSchema });
export type AddWishlistItemInput = z.infer<typeof addWishlistItemSchema>;

/** Move a wishlisted product to the cart; defaults to its default variant. */
export const moveToCartSchema = z.object({ variantId: idSchema.optional() });
export type MoveToCartInput = z.infer<typeof moveToCartSchema>;
