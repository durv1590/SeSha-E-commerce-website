import { randomBytes } from 'node:crypto';
import {
  GatewayError,
  type GatewayPayment,
  type PaymentGateway,
  type RefundResult,
  type WebhookEvent,
} from './gateway';
import { hmacHex, sha256Hex, signatureMatches } from './hmac';

/**
 * Simulated gateway for development and automated tests (refused in production by
 * env validation). It signs exactly like Razorpay, so the verification, webhook and
 * reconciliation code paths are the real ones. State lives in memory.
 */
export class MockGateway implements PaymentGateway {
  readonly name = 'mock' as const;
  readonly publicKeyId = null;
  /** providerOrderId → payments made against it. */
  readonly payments = new Map<string, GatewayPayment[]>();
  readonly orders = new Map<string, { amount: number }>();
  /** Test hook: make the next createOrder call fail. */
  failNextCreate = false;

  constructor(private readonly secret: string) {}

  private id(prefix: string) {
    return `${prefix}_${randomBytes(9).toString('base64url')}`;
  }

  async createOrder(input: { amount: number }) {
    if (this.failNextCreate) {
      this.failNextCreate = false;
      throw new GatewayError('The payment service is not responding.');
    }
    const providerOrderId = this.id('order_mock');
    this.orders.set(providerOrderId, { amount: input.amount });
    return { providerOrderId };
  }

  signPayment(providerOrderId: string, providerPaymentId: string): string {
    return hmacHex(this.secret, `${providerOrderId}|${providerPaymentId}`);
  }

  signWebhook(body: string | Buffer): string {
    return hmacHex(this.secret, body);
  }

  verifyPaymentSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }) {
    return signatureMatches(
      this.signPayment(input.providerOrderId, input.providerPaymentId),
      input.signature,
    );
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined) {
    return signatureMatches(this.signWebhook(rawBody), signature);
  }

  /** Records a payment attempt, as a customer paying on the gateway would. */
  simulatePayment(
    providerOrderId: string,
    outcome: 'success' | 'failure',
    amount?: number,
  ): GatewayPayment {
    const payment: GatewayPayment = {
      providerPaymentId: this.id('pay_mock'),
      providerOrderId,
      status: outcome === 'success' ? 'captured' : 'failed',
      amount: amount ?? this.orders.get(providerOrderId)?.amount ?? 0,
      method: 'upi',
      errorCode: outcome === 'success' ? null : 'BAD_REQUEST_ERROR',
      errorDescription:
        outcome === 'success' ? null : 'Payment was declined by the bank (simulated).',
    };
    this.payments.set(providerOrderId, [...(this.payments.get(providerOrderId) ?? []), payment]);
    return payment;
  }

  /** A Razorpay-shaped webhook body for a payment. */
  webhookBody(payment: GatewayPayment): string {
    return JSON.stringify({
      event: payment.status === 'captured' ? 'payment.captured' : 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: payment.providerPaymentId,
            order_id: payment.providerOrderId,
            status: payment.status,
            amount: payment.amount,
            method: payment.method,
            error_code: payment.errorCode,
            error_description: payment.errorDescription,
          },
        },
      },
    });
  }

  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent {
    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      payload?: {
        payment?: {
          entity: {
            id: string;
            order_id: string;
            status: GatewayPayment['status'];
            amount: number;
            method?: string;
            error_code?: string;
            error_description?: string;
          };
        };
        refund?: { entity: { id: string; payment_id: string; amount: number } };
      };
    };
    const p = body.payload?.payment?.entity;
    const r = body.payload?.refund?.entity;
    const types: Record<string, WebhookEvent['type']> = {
      'payment.captured': 'payment.captured',
      'payment.failed': 'payment.failed',
      'payment.authorized': 'payment.authorized',
      'refund.processed': 'refund.processed',
      'refund.failed': 'refund.failed',
    };
    return {
      eventId: eventIdHeader || sha256Hex(rawBody),
      rawType: body.event,
      type: types[body.event] ?? 'other',
      payment: p
        ? {
            providerPaymentId: p.id,
            providerOrderId: p.order_id,
            status: p.status,
            amount: p.amount,
            method: p.method ?? null,
            errorCode: p.error_code ?? null,
            errorDescription: p.error_description ?? null,
          }
        : null,
      refund: r
        ? { providerRefundId: r.id, providerPaymentId: r.payment_id, amount: r.amount }
        : null,
    };
  }

  async fetchOrderPayments(providerOrderId: string) {
    return this.payments.get(providerOrderId) ?? [];
  }

  async refund(): Promise<RefundResult> {
    return { providerRefundId: this.id('rfnd_mock'), status: 'processed' };
  }
}
