/**
 * Domain enumerations shared by the API and every client.
 * They mirror the Prisma enums in apps/api/prisma/schema.prisma; a unit test in the
 * API (`src/database/enums.spec.ts`) fails if the two ever drift apart.
 */

export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'INVENTORY_MANAGER',
  'CUSTOMER_SUPPORT',
  'CUSTOMER',
] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUND_INITIATED',
  'REFUNDED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  PAYMENT_PENDING: 'Payment pending',
  CONFIRMED: 'Confirmed',
  PROCESSING: 'Processing',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
  REFUND_INITIATED: 'Refund initiated',
  REFUNDED: 'Refunded',
};

export const PAYMENT_STATUSES = [
  'CREATED',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['PREPAID', 'COD'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REFUND_STATUSES = ['PENDING', 'PROCESSED', 'FAILED'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const DELIVERY_METHODS = ['STANDARD', 'EXPRESS'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const SHIPMENT_STATUSES = [
  'CREATED',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** GST slabs (percent) allowed on products. */
export const GST_RATES = [0, 3, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

export const INVENTORY_TX_TYPES = [
  'ADJUSTMENT',
  'RESTOCK',
  'RESERVE',
  'RELEASE',
  'SALE',
  'RETURN',
] as const;
export type InventoryTxType = (typeof INVENTORY_TX_TYPES)[number];

export const COUPON_TYPES = ['PERCENTAGE', 'FIXED'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const QUESTION_STATUSES = ['PENDING', 'PUBLISHED', 'REJECTED'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const RETURN_TYPES = ['RETURN', 'REPLACEMENT'] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];

export const RETURN_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'RECEIVED',
  'COMPLETED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export const OTP_CHANNELS = ['EMAIL', 'SMS'] as const;
export type OtpChannel = (typeof OTP_CHANNELS)[number];

export const OTP_PURPOSES = ['LOGIN', 'VERIFY_EMAIL', 'VERIFY_PHONE', 'RESET_PASSWORD'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const BANNER_PLACEMENTS = ['HOME_HERO', 'HOME_PROMO', 'CATEGORY_TOP'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

/** Banner themes map to design tokens — admins never enter raw colours. */
export const BANNER_THEMES = ['PRIMARY', 'NAVY', 'ACCENT', 'LIGHT'] as const;
export type BannerTheme = (typeof BANNER_THEMES)[number];

export const HOME_SECTION_SOURCES = [
  'BEST_SELLERS',
  'NEW_ARRIVALS',
  'FEATURED',
  'DEALS',
  'CATEGORY',
] as const;
export type HomeSectionSource = (typeof HOME_SECTION_SOURCES)[number];

export const CONTACT_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED'] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
