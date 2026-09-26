import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma, type Order, type Payment } from '@prisma/client';
import type { PaymentSessionDto } from '@seshakart/types';
import type { PaymentFailedInput, VerifyPaymentInput } from '@seshakart/validation';
import { AppException } from '../common/filters/all-exceptions.filter';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { orderConfirmedEmail, orderUpdateEmail } from '../messaging/templates';
import {
  GatewayError,
  PAYMENT_GATEWAY,
  type GatewayPayment,
  type PaymentGateway,
  type WebhookEvent,
} from '../payments/gateways/gateway';
import { MockGateway } from '../payments/gateways/mock.gateway';
import { release, sell } from './inventory';

const SWEEP_INTERVAL_MS = 60_000;
/** Pending orders older than this are checked with the gateway (lost webhooks). */
const RECONCILE_AFTER_MS = 5 * 60_000;
const SWEEP_BATCH = 50;

type OrderWithPayments = Order & { payments: Payment[] };

/**
 * Online payments: gateway orders, verification, webhooks, confirmation,
 * expiry/reconciliation and refunds. Every state change is idempotent and runs with
 * the order row locked, so the browser callback, the webhook and the sweeper can
 * all race safely.
 */
@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Payments');
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  get provider(): string {
    return this.gateway.name;
  }

  async createGatewayOrder(orderNumber: string, amount: number) {
    try {
      return await this.gateway.createOrder({
        amount,
        receipt: orderNumber,
        notes: { orderNumber },
      });
    } catch (err) {
      if (err instanceof GatewayError) {
        this.logger.error(`Gateway order for ${orderNumber} failed: ${err.detail ?? err.message}`);
        throw new AppException(
          HttpStatus.BAD_GATEWAY,
          'PAYMENT_UNAVAILABLE',
          'Online payment is temporarily unavailable. Please try again in a moment or choose cash on delivery.',
        );
      }
      throw err;
    }
  }

  session(order: Order, providerOrderId: string, name: string): PaymentSessionDto {
    return {
      provider: this.gateway.name,
      keyId: this.gateway.publicKeyId,
      providerOrderId,
      amount: order.grandTotal,
      currency: 'INR',
      orderNumber: order.orderNumber,
      prefill: { name, email: order.email, contact: order.phone },
      expiresAt: (order.reservationExpiresAt ?? new Date()).toISOString(),
    };
  }

  // ------------------------------------------------------------------ browser callbacks

  /** The gateway's checkout succeeded in the browser: check its signature, then confirm. */
  async verify(order: OrderWithPayments, input: VerifyPaymentInput): Promise<void> {
    const payment = order.payments.find((p) => p.providerOrderId === input.providerOrderId);
    const valid =
      payment &&
      this.gateway.verifyPaymentSignature({
        providerOrderId: input.providerOrderId,
        providerPaymentId: input.providerPaymentId,
        signature: input.signature,
      });
    if (!payment || !valid) {
      this.logger.warn(`Rejected payment verification for ${order.orderNumber}`);
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'PAYMENT_VERIFICATION_FAILED',
        'We couldn’t verify this payment. If money was deducted, it will be confirmed or refunded automatically.',
      );
    }
    await this.capture(payment.id, {
      providerPaymentId: input.providerPaymentId,
      amount: payment.amount,
      method: null,
    });
  }

  /** The browser checkout failed or was closed. The order stays payable until it expires. */
  async fail(order: OrderWithPayments, input: PaymentFailedInput): Promise<void> {
    const payment = order.payments.find(
      (p) =>
        p.status === 'CREATED' &&
        (!input.providerOrderId || p.providerOrderId === input.providerOrderId),
    );
    if (!payment) return;
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: 'CREATED' },
      data: {
        status: 'FAILED',
        errorCode: input.code?.slice(0, 60) ?? 'CHECKOUT_FAILED',
        errorDescription: input.description?.slice(0, 300) ?? null,
      },
    });
  }

  /** A fresh gateway order for a pending order (after a failed or abandoned attempt). */
  async retry(order: OrderWithPayments): Promise<PaymentSessionDto | null> {
    // Maybe the last attempt did succeed and we just haven't heard yet.
    if (await this.reconcile(order)) return null;
    const fresh = await this.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    if (
      fresh.status !== 'PAYMENT_PENDING' ||
      !fresh.reservationExpiresAt ||
      fresh.reservationExpiresAt <= new Date()
    ) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PAYMENT_NOT_RETRYABLE',
        'This order can no longer be paid for. Please place a new order.',
      );
    }
    const { providerOrderId } = await this.createGatewayOrder(fresh.orderNumber, fresh.grandTotal);
    await this.prisma.payment.create({
      data: {
        orderId: fresh.id,
        provider: this.gateway.name,
        providerOrderId,
        amount: fresh.grandTotal,
      },
    });
    const name = (fresh.shippingAddress as { name?: string }).name ?? '';
    return this.session(fresh, providerOrderId, name);
  }

  // ------------------------------------------------------------------ state changes

  /**
   * Records a captured payment and confirms its order (reserved units become sold).
   * Idempotent. A wrong amount never confirms; money arriving for an order that was
   * already cancelled is refunded automatically.
   */
  async capture(
    paymentId: string,
    p: { providerPaymentId: string; amount: number; method: string | null },
  ): Promise<void> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${payment.orderId} FOR UPDATE`;
      const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (
        current.status === 'CAPTURED' ||
        current.status === 'REFUNDED' ||
        current.status === 'PARTIALLY_REFUNDED'
      )
        return { kind: 'noop' as const };
      if (p.amount !== current.amount) {
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            errorCode: 'AMOUNT_MISMATCH',
            errorDescription: `Gateway reported ${p.amount}, expected ${current.amount}`,
          },
        });
        return { kind: 'mismatch' as const };
      }
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'CAPTURED',
          providerPaymentId: p.providerPaymentId,
          method: p.method ?? current.method,
          capturedAt: new Date(),
          errorCode: null,
          errorDescription: null,
        },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: current.orderId },
        include: { items: true },
      });
      if (order.status === 'PAYMENT_PENDING') {
        for (const item of order.items)
          if (item.variantId)
            await sell(
              tx,
              { variantId: item.variantId, productId: item.productId, quantity: item.quantity },
              order.id,
            );
        await tx.order.update({
          where: { id: order.id },
          data: { status: 'CONFIRMED', confirmedAt: new Date(), reservationExpiresAt: null },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: 'PAYMENT_PENDING',
            toStatus: 'CONFIRMED',
            note: 'Payment received',
          },
        });
        return { kind: 'confirmed' as const, orderId: order.id };
      }
      return { kind: 'late' as const, orderId: order.id, status: order.status };
    });

    if (outcome.kind === 'mismatch')
      this.logger.error(`Amount mismatch on payment ${paymentId}: needs manual review`);
    if (outcome.kind === 'confirmed') void this.sendConfirmation(outcome.orderId);
    if (outcome.kind === 'late' && outcome.status === 'CANCELLED') {
      this.logger.warn(`Payment captured for cancelled order ${outcome.orderId}: refunding`);
      await this.refund(outcome.orderId, {
        reason: 'Payment received after the order was cancelled',
      }).catch((err: unknown) =>
        this.logger.error(`Automatic refund failed: ${(err as Error).message}`),
      );
    }
  }

  /** Cancels an unpaid order whose reservation expired: stock and coupon are released. */
  async cancelUnpaid(orderId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      if (order.status !== 'PAYMENT_PENDING') return false;
      for (const item of order.items)
        if (item.variantId)
          await release(tx, item.variantId, item.quantity, order.id, 'Payment not completed');
      if (order.couponId) {
        await tx.$executeRaw`UPDATE "coupons" SET "used_count" = GREATEST("used_count" - 1, 0), "updated_at" = now() WHERE "id" = ${order.couponId}`;
        await tx.couponUsage.deleteMany({ where: { orderId } });
      }
      await tx.payment.updateMany({
        where: { orderId, status: 'CREATED' },
        data: {
          status: 'FAILED',
          errorCode: 'EXPIRED',
          errorDescription: 'Payment was not completed in time',
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: 'Payment was not completed in time',
          reservationExpiresAt: null,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'PAYMENT_PENDING',
          toStatus: 'CANCELLED',
          note: 'Payment not completed in time',
        },
      });
      return true;
    });
  }

  // ------------------------------------------------------------------ webhooks

  async handleWebhook(
    provider: string,
    rawBody: Buffer | undefined,
    signature: string | undefined,
    eventIdHeader: string | undefined,
  ): Promise<{ status: 'processed' | 'duplicate' | 'ignored' }> {
    if (provider !== this.gateway.name)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found.');
    if (!rawBody || !this.gateway.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn(`Rejected ${provider} webhook with an invalid signature`);
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'WEBHOOK_SIGNATURE_INVALID',
        'Invalid signature.',
      );
    }
    let event: WebhookEvent;
    try {
      event = this.gateway.parseWebhook(rawBody, eventIdHeader);
    } catch {
      throw new AppException(HttpStatus.BAD_REQUEST, 'WEBHOOK_INVALID', 'Unreadable webhook.');
    }

    let stored: { id: string; processedAt: Date | null };
    try {
      stored = await this.prisma.webhookEvent.create({
        data: {
          provider,
          eventId: event.eventId,
          eventType: event.rawType,
          payload: JSON.parse(rawBody.toString('utf8')) as Prisma.InputJsonValue,
        },
        select: { id: true, processedAt: true },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      stored = await this.prisma.webhookEvent.findUniqueOrThrow({
        where: { provider_eventId: { provider, eventId: event.eventId } },
        select: { id: true, processedAt: true },
      });
      if (stored.processedAt) return { status: 'duplicate' };
    }

    try {
      const note = await this.process(event);
      await this.prisma.webhookEvent.update({
        where: { id: stored.id },
        data: { processedAt: new Date(), error: note },
      });
      return { status: note ? 'ignored' : 'processed' };
    } catch (err) {
      // Not marked processed: the provider retries, and the retry runs it again.
      await this.prisma.webhookEvent.update({
        where: { id: stored.id },
        data: { error: (err as Error).message.slice(0, 500) },
      });
      throw err;
    }
  }

  /** Applies one event. Returns a note when there was nothing to do. */
  private async process(event: WebhookEvent): Promise<string | null> {
    if (event.payment && (event.type === 'payment.captured' || event.type === 'payment.failed')) {
      const row = await this.prisma.payment.findUnique({
        where: { providerOrderId: event.payment.providerOrderId },
      });
      if (!row) return 'Unknown payment order';
      if (event.type === 'payment.captured') {
        await this.capture(row.id, event.payment);
      } else {
        await this.prisma.payment.updateMany({
          where: { id: row.id, status: 'CREATED' },
          data: {
            status: 'FAILED',
            errorCode: event.payment.errorCode,
            errorDescription: event.payment.errorDescription?.slice(0, 300),
          },
        });
      }
      return null;
    }
    if (event.refund && (event.type === 'refund.processed' || event.type === 'refund.failed')) {
      const refund = await this.prisma.refund.findUnique({
        where: { providerRefundId: event.refund.providerRefundId },
      });
      if (!refund) return 'Unknown refund';
      if (event.type === 'refund.processed') await this.markRefundProcessed(refund.id);
      else
        await this.prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
      return null;
    }
    return `Ignored event ${event.rawType}`;
  }

  // ------------------------------------------------------------------ reconciliation

  /** Asks the gateway about a pending order's payments. True when one was captured. */
  async reconcile(order: OrderWithPayments): Promise<boolean> {
    for (const payment of order.payments) {
      if (!payment.providerOrderId) continue;
      let remote: GatewayPayment[];
      try {
        remote = await this.gateway.fetchOrderPayments(payment.providerOrderId);
      } catch (err) {
        this.logger.warn(
          `Reconciliation of ${order.orderNumber} failed: ${(err as Error).message}`,
        );
        throw err;
      }
      const captured = remote.find((r) => r.status === 'captured');
      if (captured) {
        await this.capture(payment.id, captured);
        return true;
      }
    }
    return false;
  }

  /**
   * Runs every minute: confirms pending orders whose payment succeeded without us
   * hearing about it, and cancels unpaid orders whose reservation has expired.
   * A gateway outage postpones cancellation rather than risk cancelling a paid order.
   */
  async sweep(now = new Date()): Promise<{ confirmed: number; cancelled: number }> {
    let confirmed = 0;
    let cancelled = 0;
    try {
      const expired = await this.prisma.order.findMany({
        where: { status: 'PAYMENT_PENDING', reservationExpiresAt: { lt: now } },
        include: { payments: true },
        take: SWEEP_BATCH,
      });
      for (const order of expired) {
        try {
          if (await this.reconcile(order)) confirmed += 1;
          else if (await this.cancelUnpaid(order.id)) cancelled += 1;
        } catch {
          // gateway unreachable: try again on the next sweep
        }
      }
      const stale = await this.prisma.order.findMany({
        where: {
          status: 'PAYMENT_PENDING',
          reservationExpiresAt: { gte: now },
          placedAt: { lt: new Date(now.getTime() - RECONCILE_AFTER_MS) },
        },
        include: { payments: true },
        take: SWEEP_BATCH,
      });
      for (const order of stale) {
        try {
          if (await this.reconcile(order)) confirmed += 1;
        } catch {
          // next sweep
        }
      }
    } catch (err) {
      this.logger.error(`Payment sweep failed: ${(err as Error).message}`);
    }
    if (confirmed || cancelled)
      this.logger.log(`Sweep: ${confirmed} confirmed, ${cancelled} cancelled`);
    return { confirmed, cancelled };
  }

  // ------------------------------------------------------------------ refunds

  /**
   * Refunds a captured payment (all of what's left by default). Used automatically
   * for late payments and, from the admin phase, for cancellations and returns.
   */
  async refund(
    orderId: string,
    opts: { amount?: number; reason: string; actorId?: string | null },
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { orderId, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
      include: { refunds: true },
      orderBy: { capturedAt: 'desc' },
    });
    const manual = payment?.provider === 'cod';
    if (!payment || (!manual && !payment.providerPaymentId))
      throw new AppException(
        HttpStatus.CONFLICT,
        'NOTHING_TO_REFUND',
        'This order has no captured payment to refund.',
      );
    const refunded = payment.refunds
      .filter((r) => r.status !== 'FAILED')
      .reduce((s, r) => s + r.amount, 0);
    const amount = opts.amount ?? payment.amount - refunded;
    if (amount <= 0 || refunded + amount > payment.amount)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'REFUND_TOO_LARGE',
        'The refund exceeds the amount paid.',
      );

    // Cash-on-delivery money goes back by bank transfer or UPI: staff complete it with
    // the transaction reference (completeManualRefund).
    const result = manual
      ? { providerRefundId: null, status: 'pending' as const }
      : await this.gateway.refund({
          providerPaymentId: payment.providerPaymentId!,
          amount,
          notes: { orderId, reason: opts.reason.slice(0, 200) },
        });
    const refund = await this.prisma.$transaction(async (tx) => {
      const row = await tx.refund.create({
        data: {
          paymentId: payment.id,
          orderId,
          amount,
          reason: opts.reason,
          actorId: opts.actorId ?? null,
          providerRefundId: result.providerRefundId,
          status: result.status === 'failed' ? 'FAILED' : 'PENDING',
        },
      });
      // Only orders that are over (cancelled, returned) move to REFUND_*; a goodwill or
      // partial refund on an order still being fulfilled leaves its status alone.
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (
        result.status !== 'failed' &&
        (order.status === 'CANCELLED' || order.status === 'RETURNED')
      ) {
        await tx.order.update({ where: { id: orderId }, data: { status: 'REFUND_INITIATED' } });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: 'REFUND_INITIATED',
            note: opts.reason,
            actorId: opts.actorId ?? null,
          },
        });
      }
      return row;
    });
    if (result.status === 'processed') await this.markRefundProcessed(refund.id);
    return refund;
  }

  /** Staff record that a manual (cash-on-delivery) refund was paid out. */
  async completeManualRefund(refundId: string, reference: string, actorId: string | null) {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
    if (!refund) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Refund not found.');
    if (refund.payment.provider !== 'cod' || refund.status !== 'PENDING')
      throw new AppException(
        HttpStatus.CONFLICT,
        'REFUND_NOT_MANUAL',
        'Only pending manual refunds can be completed here.',
      );
    await this.prisma.refund.update({ where: { id: refundId }, data: { reference, actorId } });
    await this.markRefundProcessed(refundId);
  }

  /** Cash collected on delivery becomes a captured payment (so it can be refunded). */
  async recordCodCollected(
    tx: Prisma.TransactionClient,
    order: { id: string; grandTotal: number },
  ) {
    const existing = await tx.payment.findFirst({ where: { orderId: order.id, provider: 'cod' } });
    if (existing || order.grandTotal <= 0) return;
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: 'cod',
        method: 'cod',
        amount: order.grandTotal,
        status: 'CAPTURED',
        capturedAt: new Date(),
      },
    });
  }

  private async markRefundProcessed(refundId: string): Promise<void> {
    const processed = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${refund.orderId} FOR UPDATE`;
      if (refund.status === 'PROCESSED') return null;
      await tx.refund.update({
        where: { id: refundId },
        data: { status: 'PROCESSED', processedAt: new Date() },
      });
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: refund.paymentId },
        include: { refunds: true },
      });
      const done = payment.refunds
        .map((r) => (r.id === refundId ? { ...r, status: 'PROCESSED' as const } : r))
        .filter((r) => r.status === 'PROCESSED')
        .reduce((s, r) => s + r.amount, 0);
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: done >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id: refund.orderId } });
      const stillPending = await tx.refund.count({
        where: { orderId: order.id, status: 'PENDING', id: { not: refundId } },
      });
      if (order.status === 'REFUND_INITIATED' && stillPending === 0) {
        await tx.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'REFUNDED',
            note: 'Refund processed',
          },
        });
      }
      return { order, amount: refund.amount };
    });
    if (processed) void this.sendRefundEmail(processed.order, processed.amount);
  }

  private async sendRefundEmail(order: Order, amount: number): Promise<void> {
    try {
      const a = order.shippingAddress as Record<string, string | null>;
      await this.messaging.sendEmail({
        to: order.email,
        ...orderUpdateEmail({
          name: a.name ?? 'there',
          orderNumber: order.orderNumber,
          subject: `Refund processed for order ${order.orderNumber}`,
          headline: `We’ve refunded ₹${(amount / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} for your order ${order.orderNumber}.`,
          paragraphs: [
            order.paymentMethod === 'COD'
              ? 'The money has been sent to your bank account or UPI ID.'
              : 'It goes back to your original payment method. Banks usually take 5–7 working days to show it.',
          ],
          orderUrl: this.orderUrl(order),
        }),
      });
    } catch (err) {
      this.logger.warn(`Refund email failed: ${(err as Error).message}`);
    }
  }

  /** Customers see their orders in their account; guests use order tracking. */
  orderUrl(order: { orderNumber: string; userId: string | null }): string {
    return order.userId
      ? `${this.env.APP_URL}/account/orders/${order.orderNumber}`
      : `${this.env.APP_URL}/track-order?order=${order.orderNumber}`;
  }

  // ------------------------------------------------------------------ notifications

  async sendConfirmation(orderId: string): Promise<void> {
    try {
      const order = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      const a = order.shippingAddress as Record<string, string | null>;
      const email = orderConfirmedEmail({
        name: a.name ?? 'there',
        orderNumber: order.orderNumber,
        paymentMethod: order.paymentMethod,
        total: order.grandTotal,
        items: order.items.map((i) => ({
          name: i.productName,
          variantName: i.variantName,
          quantity: i.quantity,
          lineTotal: i.lineTotal,
        })),
        address: [a.line1, a.line2, a.city, a.state, a.pincode].filter(Boolean).join(', '),
        orderUrl: this.orderUrl(order),
      });
      await this.messaging.sendEmail({ to: order.email, ...email });
    } catch (err) {
      this.logger.warn(`Order confirmation email failed: ${(err as Error).message}`);
    }
  }

  // ------------------------------------------------------------------ development

  /**
   * Mock gateway only (never in production): simulates the customer paying, delivers a
   * signed webhook through the real handler, and returns what a real checkout would
   * hand the browser.
   */
  async mockComplete(order: OrderWithPayments, outcome: 'success' | 'failure') {
    if (!(this.gateway instanceof MockGateway) || this.env.NODE_ENV === 'production')
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found.');
    const payment = order.payments.find((p) => p.status === 'CREATED' && p.providerOrderId);
    if (!payment)
      throw new AppException(
        HttpStatus.CONFLICT,
        'PAYMENT_NOT_PENDING',
        'There is no payment waiting for this order.',
      );
    const paid = this.gateway.simulatePayment(payment.providerOrderId!, outcome, payment.amount);
    const body = Buffer.from(this.gateway.webhookBody(paid));
    await this.handleWebhook('mock', body, this.gateway.signWebhook(body), undefined);
    return {
      providerOrderId: paid.providerOrderId,
      providerPaymentId: paid.providerPaymentId,
      signature: this.gateway.signPayment(paid.providerOrderId, paid.providerPaymentId),
      error: paid.errorDescription,
    };
  }
}
