import type { CartDto } from './cart';
import type { DeliveryMethod, OrderStatus, PaymentMethod, PaymentStatus } from './enums';

/** Checkout contracts. Amounts in paise, always computed by the server. */

export interface CheckoutTotalsDto {
  itemCount: number;
  mrpTotal: number;
  subtotal: number;
  productDiscount: number;
  couponDiscount: number;
  shippingFee: number;
  codFee: number;
  /** GST included in the prices (not added on top). */
  taxIncluded: number;
  total: number;
}

export interface DeliveryOptionDto {
  method: DeliveryMethod;
  label: string;
  /** e.g. "3–6 business days". */
  estimate: string;
  fee: number;
  available: boolean;
}

export interface PaymentOptionDto {
  method: PaymentMethod;
  label: string;
  description: string;
  fee: number;
  available: boolean;
  /** Why it isn't available (e.g. COD limits). */
  reason: string | null;
}

export interface CheckoutQuoteDto {
  cart: CartDto;
  deliveryOptions: DeliveryOptionDto[];
  paymentOptions: PaymentOptionDto[];
  totals: CheckoutTotalsDto;
  canPlaceOrder: boolean;
}

/** Everything the browser needs to open the gateway's checkout. No secrets. */
export interface PaymentSessionDto {
  provider: 'razorpay' | 'mock';
  /** Public key id (Razorpay); null for the mock gateway. */
  keyId: string | null;
  providerOrderId: string;
  amount: number;
  currency: 'INR';
  orderNumber: string;
  prefill: { name: string; email: string; contact: string };
  /** Stock is held until then; after it the order is cancelled if unpaid. */
  expiresAt: string;
}

export interface PlaceOrderResultDto {
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: number;
  /** Present for online payments. */
  payment: PaymentSessionDto | null;
  /** Guests only: lets this browser view the order. Shown once; only a hash is stored. */
  guestAccessToken: string | null;
}

export interface OrderAddressDto {
  name: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface OrderLineDto {
  name: string;
  slug: string | null;
  variantName: string;
  sku: string;
  imageUrl: string | null;
  quantity: number;
  mrp: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}

/** Order as shown on the confirmation / payment-failed pages. */
export interface OrderSummaryDto {
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus | null;
  deliveryMethod: DeliveryMethod;
  placedAt: string;
  reservationExpiresAt: string | null;
  email: string;
  phone: string;
  shippingAddress: OrderAddressDto;
  items: OrderLineDto[];
  couponCode: string | null;
  totals: {
    mrpTotal: number;
    subtotal: number;
    couponDiscount: number;
    shippingFee: number;
    codFee: number;
    taxTotal: number;
    grandTotal: number;
  };
  /** Online payment still possible (pending and not expired). */
  canRetryPayment: boolean;
}
