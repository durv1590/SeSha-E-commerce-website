import type { ImageDto, StockState } from './catalog';

/**
 * Cart and wishlist contracts. Every amount is in paise and computed by the server
 * from live prices; the client never sends prices or totals.
 */

/** Why a cart line can't be bought right now. */
export type CartLineIssue =
  /** Product, variant or its category was withdrawn. */
  | 'UNAVAILABLE'
  | 'OUT_OF_STOCK'
  /** Fewer units available than requested; see `maxQuantity`. */
  | 'INSUFFICIENT_STOCK';

export interface CartLineDto {
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  /** Variant label, e.g. "Black / 128 GB"; null for single-variant products. */
  variantName: string | null;
  options: Record<string, string>;
  image: ImageDto | null;
  quantity: number;
  /** Live unit price and MRP. */
  price: number;
  mrp: number;
  /** price × quantity. */
  lineTotal: number;
  /** Most the shopper can set right now (stock and store limit). 0 when unavailable. */
  maxQuantity: number;
  stock: StockState;
  issue: CartLineIssue | null;
  savedForLater: boolean;
}

export interface CartCouponDto {
  code: string;
  /** False when the coupon no longer applies (expired, cart below minimum…). */
  valid: boolean;
  discount: number;
  /** Customer-facing explanation when not valid, or a short description when valid. */
  message: string | null;
}

export interface CartTotalsDto {
  /** Units in the cart (excluding saved-for-later and unavailable lines). */
  itemCount: number;
  mrpTotal: number;
  subtotal: number;
  /** MRP savings (mrpTotal − subtotal). */
  productDiscount: number;
  couponDiscount: number;
  /** Standard delivery estimate; express/COD are chosen at checkout. */
  shippingFee: number;
  /** GST included in the prices (not added on top). */
  taxIncluded: number;
  total: number;
  /** Amount left to spend for free standard delivery; 0 when already free. */
  freeShippingRemaining: number;
  freeShippingThreshold: number;
}

export interface CartDto {
  id: string | null;
  items: CartLineDto[];
  savedForLater: CartLineDto[];
  coupon: CartCouponDto | null;
  totals: CartTotalsDto;
  /** True when there is something to buy and no line needs attention. */
  canCheckout: boolean;
  maxQuantityPerItem: number;
}

/** Lightweight badge data for the header. */
export interface CartSummaryDto {
  count: number;
}

export interface WishlistItemDto {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  image: ImageDto | null;
  price: number;
  mrp: number;
  stock: StockState;
  defaultVariantId: string | null;
  hasMultipleVariants: boolean;
  /** False when the product was withdrawn (kept so the shopper sees what happened). */
  available: boolean;
  addedAt: string;
}
