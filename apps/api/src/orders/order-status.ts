import type { OrderStatus } from '@prisma/client';
import type { TimelineStepDto } from '@seshakart/types';

/**
 * The order lifecycle. Every status change made by customers or staff is checked
 * against this table; payment and refund bookkeeping (PaymentsService) moves orders
 * to CONFIRMED / CANCELLED / REFUND_* on its own, idempotently.
 *
 *   PENDING → PAYMENT_PENDING → CONFIRMED → PROCESSING → PACKED → SHIPPED
 *     → OUT_FOR_DELIVERY → DELIVERED → RETURN_REQUESTED → RETURNED → REFUND_*
 */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAYMENT_PENDING', 'CONFIRMED', 'CANCELLED'],
  PAYMENT_PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'PACKED', 'SHIPPED', 'CANCELLED'],
  PROCESSING: ['PACKED', 'SHIPPED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  // A failed delivery attempt goes back to SHIPPED; undeliverable parcels come back (RTO).
  SHIPPED: ['OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'SHIPPED', 'RETURNED'],
  DELIVERED: ['RETURN_REQUESTED'],
  // Back to DELIVERED when every request is rejected or a replacement is delivered.
  RETURN_REQUESTED: ['DELIVERED', 'RETURNED'],
  RETURNED: ['REFUND_INITIATED', 'REFUNDED'],
  CANCELLED: ['REFUND_INITIATED', 'REFUNDED'],
  REFUND_INITIATED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Customers can cancel until the order is packed. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = [
  'PENDING',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'PROCESSING',
];
/** Staff can cancel until it ships. */
export const STAFF_CANCELLABLE: readonly OrderStatus[] = [...CUSTOMER_CANCELLABLE, 'PACKED'];

/** Units have left stock (sold) in these statuses; before them they are only reserved. */
export const STOCK_SOLD: readonly OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'PACKED'];

export const ACTIVE_STATUSES: readonly OrderStatus[] = [
  'PENDING',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
];

const RANK: Partial<Record<OrderStatus, number>> = {
  PENDING: 0,
  PAYMENT_PENDING: 0,
  CONFIRMED: 1,
  PROCESSING: 1,
  PACKED: 1,
  SHIPPED: 2,
  OUT_FOR_DELIVERY: 3,
  DELIVERED: 4,
  RETURN_REQUESTED: 4,
  RETURNED: 4,
};

const STEPS: { key: TimelineStepDto['key']; label: string; reachedBy: OrderStatus[] }[] = [
  { key: 'PLACED', label: 'Order placed', reachedBy: ['PENDING', 'PAYMENT_PENDING'] },
  { key: 'CONFIRMED', label: 'Confirmed', reachedBy: ['CONFIRMED'] },
  { key: 'SHIPPED', label: 'Shipped', reachedBy: ['SHIPPED'] },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery', reachedBy: ['OUT_FOR_DELIVERY'] },
  { key: 'DELIVERED', label: 'Delivered', reachedBy: ['DELIVERED'] },
];

/**
 * The customer-facing progress bar, from the status history. Steps show the time
 * they were first reached. Cancelled/refunded orders show only what happened.
 */
export function timeline(
  status: OrderStatus,
  placedAt: Date,
  history: { toStatus: OrderStatus; createdAt: Date }[],
): TimelineStepDto[] {
  const firstAt = (statuses: OrderStatus[]) =>
    history
      .filter((h) => statuses.includes(h.toStatus))
      .map((h) => h.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const everDelivered = history.some((h) => h.toStatus === 'DELIVERED');
  const rank = RANK[status] ?? (everDelivered ? 4 : -1);
  return STEPS.map((step, i) => {
    const at = i === 0 ? placedAt : firstAt(step.reachedBy);
    const done = i === 0 || (rank >= i && at !== null) || (at !== null && rank === -1);
    return { key: step.key, label: step.label, at: done && at ? at.toISOString() : null, done };
  });
}
