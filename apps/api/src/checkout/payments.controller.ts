import { Controller, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { OrderSummaryDto, PaymentSessionDto } from '@seshakart/types';
import {
  mockPaymentSchema,
  orderRefSchema,
  paymentFailedSchema,
  verifyPaymentSchema,
  type MockPaymentInput,
  type PaymentFailedInput,
  type VerifyPaymentInput,
} from '@seshakart/validation';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { z } from 'zod';
import { ZodBody } from '../common/validation/zod.pipe';
import { CheckoutService } from './checkout.service';
import { orderAccess } from './order-access';
import { PaymentsService } from './payments.service';

const MINUTE = 60_000;

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentsService,
  ) {}

  /** After a successful gateway checkout: signature check, then the confirmed order. */
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  async verify(
    @ZodBody(verifyPaymentSchema) body: VerifyPaymentInput,
    @Req() req: Request,
  ): Promise<OrderSummaryDto> {
    const access = orderAccess(req);
    await this.payments.verify(await this.checkout.findAccessible(body.orderNumber, access), body);
    return this.checkout.summary(body.orderNumber, access);
  }

  @Post('failed')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: MINUTE } })
  async failed(
    @ZodBody(paymentFailedSchema) body: PaymentFailedInput,
    @Req() req: Request,
  ): Promise<OrderSummaryDto> {
    const access = orderAccess(req);
    await this.payments.fail(await this.checkout.findAccessible(body.orderNumber, access), body);
    return this.checkout.summary(body.orderNumber, access);
  }

  /** New payment attempt for a pending order; null session means it was already paid. */
  @Post('retry')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  async retry(
    @ZodBody(orderRefSchema) body: z.infer<typeof orderRefSchema>,
    @Req() req: Request,
  ): Promise<{ payment: PaymentSessionDto | null; order: OrderSummaryDto }> {
    const access = orderAccess(req);
    const payment = await this.payments.retry(
      await this.checkout.findAccessible(body.orderNumber, access),
    );
    return { payment, order: await this.checkout.summary(body.orderNumber, access) };
  }

  /** Development/test only (mock gateway): simulate the customer paying. */
  @Post('mock/complete')
  @HttpCode(HttpStatus.OK)
  async mockComplete(@ZodBody(mockPaymentSchema) body: MockPaymentInput, @Req() req: Request) {
    const order = await this.checkout.findAccessible(body.orderNumber, orderAccess(req));
    return this.payments.mockComplete(order, body.outcome);
  }
}

/**
 * Gateway webhooks: authenticated by signature over the raw body (exempt from CSRF,
 * which is for browsers). Always idempotent.
 */
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 600, ttl: MINUTE } })
  receive(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    return this.payments.handleWebhook(
      provider,
      req.rawBody,
      req.header('x-razorpay-signature') ?? req.header('x-webhook-signature'),
      req.header('x-razorpay-event-id') ?? req.header('x-webhook-event-id'),
    );
  }
}
