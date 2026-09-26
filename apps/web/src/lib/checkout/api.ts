'use client';

import type { OrderSummaryDto, PaymentSessionDto } from '@seshakart/types';
import { apiRequest } from '../api/browser';
import { orderTokenHeaders } from './order-tokens';

/** Order and payment calls, carrying the guest's order token when there is one. */
export const orderApi = {
  get: (orderNumber: string) =>
    apiRequest<OrderSummaryDto>(
      'GET',
      `/checkout/orders/${orderNumber}`,
      undefined,
      orderTokenHeaders(orderNumber),
    ).then((r) => r.data),
  verify: (body: {
    orderNumber: string;
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }) =>
    apiRequest<OrderSummaryDto>(
      'POST',
      '/payments/verify',
      body,
      orderTokenHeaders(body.orderNumber),
    ).then((r) => r.data),
  failed: (body: {
    orderNumber: string;
    providerOrderId?: string;
    code?: string;
    description?: string;
  }) =>
    apiRequest<OrderSummaryDto>(
      'POST',
      '/payments/failed',
      body,
      orderTokenHeaders(body.orderNumber),
    ).then((r) => r.data),
  retry: (orderNumber: string) =>
    apiRequest<{ payment: PaymentSessionDto | null; order: OrderSummaryDto }>(
      'POST',
      '/payments/retry',
      { orderNumber },
      orderTokenHeaders(orderNumber),
    ).then((r) => r.data),
  mockComplete: (orderNumber: string, outcome: 'success' | 'failure') =>
    apiRequest<{
      providerOrderId: string;
      providerPaymentId: string;
      signature: string;
      error: string | null;
    }>(
      'POST',
      '/payments/mock/complete',
      { orderNumber, outcome },
      orderTokenHeaders(orderNumber),
    ).then((r) => r.data),
};
