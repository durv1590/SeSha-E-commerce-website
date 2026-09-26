import { Controller, Get, Header, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CheckoutQuoteDto, OrderSummaryDto, PlaceOrderResultDto } from '@seshakart/types';
import {
  checkoutQuoteSchema,
  orderNumberSchema,
  placeOrderSchema,
  type CheckoutQuoteInput,
  type PlaceOrderInput,
} from '@seshakart/validation';
import type { Request, Response } from 'express';
import { readGuestToken } from '../cart/cart-cookie';
import type { CartOwner } from '../cart/cart.service';
import { ZodBody, ZodParam } from '../common/validation/zod.pipe';
import { CheckoutService } from './checkout.service';
import { orderAccess } from './order-access';

const MINUTE = 60_000;

/**
 * Checkout for guests and signed-in customers. Totals are recomputed from the cart
 * on the server; the client's `expectedTotal` only guards against silent changes.
 */
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  private owner(req: Request): CartOwner {
    return { userId: req.auth?.userId ?? null, guestToken: readGuestToken(req) };
  }

  /** Delivery and payment options with totals for a choice. */
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  quote(
    @ZodBody(checkoutQuoteSchema) body: CheckoutQuoteInput,
    @Req() req: Request,
  ): Promise<CheckoutQuoteDto> {
    return this.checkout.quote(this.owner(req), body);
  }

  @Post('orders')
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  async place(
    @ZodBody(placeOrderSchema) body: PlaceOrderInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PlaceOrderResultDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.checkout.placeOrder(this.owner(req), body);
  }

  /** Confirmation / payment page data: the customer, or a guest with X-Order-Token. */
  @Get('orders/:orderNumber')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  order(
    @ZodParam('orderNumber', orderNumberSchema) orderNumber: string,
    @Req() req: Request,
  ): Promise<OrderSummaryDto> {
    return this.checkout.summary(orderNumber, orderAccess(req));
  }
}
