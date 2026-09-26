'use client';

import type { OrderDetailDto, ServiceabilityDto, TrackOrderDto } from '@seshakart/types';
import type { CancelOrderInput, ReturnRequestInput } from '@seshakart/validation';
import { apiRequest } from '../api/browser';
import { ApiError } from '../api/errors';
import { orderTokenHeaders } from '../checkout/order-tokens';

/** Order actions from the browser (customers by session, guests by order token). */
export const ordersApi = {
  cancel: (n: string, body: CancelOrderInput) =>
    apiRequest<OrderDetailDto>('POST', `/orders/${n}/cancel`, body, orderTokenHeaders(n)).then(
      (r) => r.data,
    ),
  requestReturn: (n: string, body: ReturnRequestInput) =>
    apiRequest<OrderDetailDto>('POST', `/orders/${n}/returns`, body, orderTokenHeaders(n)).then(
      (r) => r.data,
    ),
  track: (orderNumber: string, contact: string) =>
    apiRequest<TrackOrderDto>('POST', '/orders/track', { orderNumber, contact }).then(
      (r) => r.data,
    ),
  serviceability: (pincode: string) =>
    apiRequest<ServiceabilityDto>(
      'GET',
      `/shipping/serviceability?pincode=${encodeURIComponent(pincode)}`,
    ).then((r) => r.data),

  /** Downloads the invoice PDF (a fetch, so guests' token header can be sent). */
  async downloadInvoice(n: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`/api/orders/${n}/invoice`, {
        credentials: 'same-origin',
        headers: orderTokenHeaders(n),
      });
    } catch {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'We couldn’t reach SeShaKart. Check your connection and try again.',
      );
    }
    if (!res.ok) throw await ApiError.fromResponse(res);
    const blob = await res.blob();
    const name =
      /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ??
      `invoice-${n}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },
};
