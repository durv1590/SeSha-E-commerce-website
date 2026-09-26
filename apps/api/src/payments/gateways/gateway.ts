/**
 * Payment gateway contract. The checkout never talks to a provider directly, so a
 * second gateway (Cashfree, PhonePe, Stripe) is one more implementation of this
 * interface. Implementations hold the secrets; nothing here is ever sent to a browser
 * except `publicKeyId`.
 */
export type GatewayName = 'razorpay' | 'mock';

export interface GatewayPayment {
  providerPaymentId: string;
  providerOrderId: string;
  status: 'created' | 'authorized' | 'captured' | 'failed' | 'refunded';
  amount: number;
  method: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

export type WebhookEventType =
  | 'payment.authorized'
  | 'payment.captured'
  | 'payment.failed'
  | 'refund.processed'
  | 'refund.failed'
  | 'other';

export interface WebhookEvent {
  /** Provider's unique event id (idempotency key). */
  eventId: string;
  type: WebhookEventType;
  rawType: string;
  payment: GatewayPayment | null;
  refund: { providerRefundId: string; providerPaymentId: string; amount: number } | null;
}

export interface RefundResult {
  providerRefundId: string;
  status: 'pending' | 'processed' | 'failed';
}

/** Customer-safe failure from the gateway (details are logged, not shown). */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export interface PaymentGateway {
  readonly name: GatewayName;
  /** Public key for the browser checkout; null when not applicable. */
  readonly publicKeyId: string | null;
  createOrder(input: {
    amount: number;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<{ providerOrderId: string }>;
  /** Checks the signature the browser receives after a successful checkout. */
  verifyPaymentSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;
  /** Checks a webhook against the raw request body (before any JSON parsing). */
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
  parseWebhook(rawBody: Buffer, eventIdHeader: string | undefined): WebhookEvent;
  /** Source of truth for reconciliation. */
  fetchOrderPayments(providerOrderId: string): Promise<GatewayPayment[]>;
  refund(input: {
    providerPaymentId: string;
    amount: number;
    notes: Record<string, string>;
  }): Promise<RefundResult>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
