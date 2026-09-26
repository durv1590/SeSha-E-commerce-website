'use client';

import type { PaymentSessionDto } from '@seshakart/types';
import { orderApi } from './api';

/** How a payment attempt ended, from the shopper's point of view. */
export type PaymentOutcome = 'paid' | 'failed' | 'dismissed';

interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RazorpayFailure {
  error?: { code?: string; description?: string; metadata?: { order_id?: string } };
}
interface RazorpayInstance {
  open(): void;
  on(event: 'payment.failed', cb: (r: RazorpayFailure) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let scriptPromise: Promise<void> | null = null;

/** Loads Razorpay Checkout once, on demand (allowed by the CSP). */
function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(
        new Error('We couldn’t load the payment window. Check your connection and try again.'),
      );
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Opens the gateway's checkout for a payment session and resolves when the shopper
 * has paid (and the API has verified it), payment failed, or they closed the window.
 * The mock gateway (development) is handled by `mockPrompt`, a UI supplied by the page.
 */
export async function pay(
  session: PaymentSessionDto,
  mockPrompt: () => Promise<'success' | 'failure' | 'cancel'>,
): Promise<PaymentOutcome> {
  if (session.provider === 'mock') {
    const choice = await mockPrompt();
    if (choice === 'cancel') {
      await orderApi.failed({
        orderNumber: session.orderNumber,
        providerOrderId: session.providerOrderId,
        code: 'DISMISSED',
      });
      return 'dismissed';
    }
    const r = await orderApi.mockComplete(session.orderNumber, choice);
    if (choice === 'failure') {
      await orderApi.failed({
        orderNumber: session.orderNumber,
        providerOrderId: r.providerOrderId,
        code: 'BAD_REQUEST_ERROR',
        description: r.error ?? undefined,
      });
      return 'failed';
    }
    await orderApi.verify({
      orderNumber: session.orderNumber,
      providerOrderId: r.providerOrderId,
      providerPaymentId: r.providerPaymentId,
      signature: r.signature,
    });
    return 'paid';
  }

  await loadRazorpay();
  return new Promise<PaymentOutcome>((resolve) => {
    let failedOnce = false;
    const rzp = new window.Razorpay!({
      key: session.keyId,
      order_id: session.providerOrderId,
      amount: session.amount,
      currency: session.currency,
      name: 'SeShaKart',
      description: `Order ${session.orderNumber}`,
      prefill: session.prefill,
      theme: { color: '#0B5FFF' },
      retry: { enabled: true },
      handler: async (res: RazorpaySuccess) => {
        try {
          await orderApi.verify({
            orderNumber: session.orderNumber,
            providerOrderId: res.razorpay_order_id,
            providerPaymentId: res.razorpay_payment_id,
            signature: res.razorpay_signature,
          });
          resolve('paid');
        } catch {
          // Verification failed or the network dropped: the webhook/sweeper still
          // settles it; the success page shows the live status.
          resolve('paid');
        }
      },
      modal: {
        confirm_close: true,
        ondismiss: () => {
          void orderApi
            .failed({
              orderNumber: session.orderNumber,
              providerOrderId: session.providerOrderId,
              code: failedOnce ? 'FAILED' : 'DISMISSED',
            })
            .catch(() => undefined);
          resolve(failedOnce ? 'failed' : 'dismissed');
        },
      },
    });
    // Razorpay lets the shopper try another method in the same window; we only note it.
    rzp.on('payment.failed', () => {
      failedOnce = true;
    });
    rzp.open();
  });
}
