import type { OrderStatus } from '@seshakart/types';
import { Badge } from '@seshakart/ui';

const TONE: Record<OrderStatus, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  PENDING: 'warning',
  PAYMENT_PENDING: 'warning',
  CONFIRMED: 'info',
  PROCESSING: 'info',
  PACKED: 'info',
  SHIPPED: 'info',
  OUT_FOR_DELIVERY: 'info',
  DELIVERED: 'success',
  CANCELLED: 'neutral',
  RETURN_REQUESTED: 'warning',
  RETURNED: 'neutral',
  REFUND_INITIATED: 'warning',
  REFUNDED: 'success',
};

export function OrderStatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return <Badge variant={TONE[status]}>{label}</Badge>;
}
