import { Logger } from '@nestjs/common';
import {
  GatewayError,
  type GatewayPayment,
  type PaymentGateway,
  type RefundResult,
  type WebhookEvent,
  type WebhookEventType,
} from './gateway';
import { hmacHex, sha256Hex, signatureMatches } from './hmac';

interface RazorpayPayment {
  id: string;
  order_id: string;
  status: GatewayPayment['status'];
  amount: number;
  method?: string | null;
  error_code?: string | null;
  error_description?: string | null;
}

const EVENT_TYPES: Record<string, WebhookEventType> = {
  'payment.authorized': 'payment.authorized',
  'payment.captured': 'payment.captured',
  'order.paid': 'payment.captured',
  'payment.failed': 'payment.failed',
  'refund.processed': 'refund.processed',
  'refund.failed': 'refund.failed',
};

const TIMEOUT_MS = 10_000;

function toPayment(p: RazorpayPayment): GatewayPayment {
  return {
    providerPaymentId: p.id,
    providerOrderId: p.order_id,
    status: p.status,
    amount: p.amount,
    method: p.method ?? null,
    errorCode: p.error_code ?? null,
    errorDescription: p.error_description ?? null,
  };
}

/**
 * Razorpay over its REST API (no SDK): Basic auth with the key id and secret, amounts
 * in paise. Orders are created with automatic capture, so a successful checkout ends
 * as `payment.captured`.
 */
export class RazorpayGateway implements PaymentGateway {
  readonly name = 'razorpay' as const;
  private readonly logger = new Logger('Razorpay');

  constructor(
    readonly publicKeyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
    private readonly baseUrl = 'https://api.razorpay.com',
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.publicKeyId}:${this.keySecret}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new GatewayError('The payment service is not responding.', (err as Error).message);
    }
    const text = await res.text();
    if (!res.ok) {
      // Log the provider's description, never the credentials.
      this.logger.warn(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
      throw new GatewayError(
        'The payment service could not process this request.',
        text.slice(0, 300),
      );
    }
    return JSON.parse(text) as T;
  }

  async createOrder(input: { amount: number; receipt: string; notes: Record<string, string> }) {
    const order = await this.call<{ id: string }>('POST', '/v1/orders', {
      amount: input.amount,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
      payment_capture: 1,
    });
    return { providerOrderId: order.id };
  }

  verifyPaymentSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }) {
    const expected = hmacHex(this.keySecret, `${input.providerOrderId}|${input.providerPaymentId}`);
    return signatureMatches(expected, input.signature);
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
    return signatureMatches(hmacHex(this.webhookSecret, rawBody), signature);
  }

  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent {
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: {
        payment?: { entity: RazorpayPayment };
        refund?: { entity: { id: string; payment_id: string; amount: number } };
      };
    };
    const refund = body.payload?.refund?.entity;
    return {
      eventId: eventIdHeader || sha256Hex(rawBody),
      rawType: body.event,
      type: EVENT_TYPES[body.event] ?? 'other',
      payment: body.payload?.payment ? toPayment(body.payload.payment.entity) : null,
      refund: refund
        ? {
            providerRefundId: refund.id,
            providerPaymentId: refund.payment_id,
            amount: refund.amount,
          }
        : null,
    };
  }

  async fetchOrderPayments(providerOrderId: string): Promise<GatewayPayment[]> {
    const res = await this.call<{ items: RazorpayPayment[] }>(
      'GET',
      `/v1/orders/${encodeURIComponent(providerOrderId)}/payments`,
    );
    return res.items.map(toPayment);
  }

  async refund(input: {
    providerPaymentId: string;
    amount: number;
    notes: Record<string, string>;
  }): Promise<RefundResult> {
    const r = await this.call<{ id: string; status: RefundResult['status'] }>(
      'POST',
      `/v1/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      { amount: input.amount, notes: input.notes },
    );
    return { providerRefundId: r.id, status: r.status };
  }
}
