import type { OrderAddressDto, OrderLineDto } from './checkout';
import type {
  DeliveryMethod,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from './enums';

/** Customer order views. Amounts in paise. */

export interface OrderListItemDto {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  placedAt: string;
  total: number;
  itemCount: number;
  /** Up to 4 thumbnails. */
  images: (string | null)[];
  firstItemName: string;
  /** Delivered-on or expected-by, when known. */
  deliveryNote: string | null;
}

export interface TimelineStepDto {
  key: 'PLACED' | 'CONFIRMED' | 'SHIPPED' | 'OUT_FOR_DELIVERY' | 'DELIVERED';
  label: string;
  /** When reached; null for future steps. */
  at: string | null;
  done: boolean;
}

export interface ShipmentEventDto {
  status: string;
  label: string;
  location: string | null;
  note: string | null;
  at: string;
}

export interface ShipmentDto {
  carrier: string;
  carrierName: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string;
  isReturn: boolean;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  events: ShipmentEventDto[];
}

export interface RefundDto {
  amount: number;
  status: RefundStatus;
  statusLabel: string;
  reason: string | null;
  createdAt: string;
  processedAt: string | null;
}

export interface ReturnRequestDto {
  id: string;
  type: 'RETURN' | 'REPLACEMENT';
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'COMPLETED';
  statusLabel: string;
  reason: string;
  comments: string | null;
  resolutionNote: string | null;
  items: { orderItemId: string; name: string; variantName: string; quantity: number }[];
  createdAt: string;
}

export interface OrderDetailLineDto extends OrderLineDto {
  id: string;
  /** Units that can still be returned or replaced (0 if not returnable). */
  returnableQuantity: number;
}

export interface OrderDetailDto {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus | null;
  deliveryMethod: DeliveryMethod;
  placedAt: string;
  email: string;
  phone: string;
  shippingAddress: OrderAddressDto;
  billingAddress: OrderAddressDto;
  items: OrderDetailLineDto[];
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
  timeline: TimelineStepDto[];
  /** Expected delivery window while in transit. */
  estimatedDelivery: { from: string; to: string } | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  shipments: ShipmentDto[];
  returns: ReturnRequestDto[];
  refunds: RefundDto[];
  invoice: { number: string; date: string } | null;
  canCancel: boolean;
  /** Last day a return/replacement can be requested (for delivered orders). */
  returnDeadline: string | null;
  canRequestReturn: boolean;
  canRetryPayment: boolean;
}

/** Public tracking (no prices or address details). */
export interface TrackOrderDto {
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  placedAt: string;
  itemCount: number;
  deliveryCity: string;
  timeline: TimelineStepDto[];
  estimatedDelivery: { from: string; to: string } | null;
  shipments: ShipmentDto[];
}

export interface ServiceabilityDto {
  pincode: string;
  serviceable: boolean;
  codAvailable: boolean;
  standard: { from: string; to: string } | null;
  express: { from: string; to: string } | null;
  message: string;
}
