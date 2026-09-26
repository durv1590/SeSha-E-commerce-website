import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { OrderDetailDto, OrderListItemDto, TrackOrderDto } from '@seshakart/types';
import {
  cancelOrderSchema,
  createShipmentSchema,
  idSchema,
  manualRefundSchema,
  orderListQuerySchema,
  orderNumberSchema,
  refundRequestSchema,
  returnActionSchema,
  returnRequestSchema,
  shipmentEventSchema,
  staffCancelSchema,
  staffOrderStatusSchema,
  trackOrderSchema,
  type CancelOrderInput,
  type CreateShipmentInput,
  type OrderListQuery,
  type ReturnActionInput,
  type ReturnRequestInput,
  type ShipmentEventInput,
  type TrackOrderInput,
} from '@seshakart/validation';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import type { AuthContext } from '../auth/auth.types';
import { Authenticated, CurrentAuth, RequirePermissions } from '../auth/decorators';
import { orderAccess } from '../checkout/order-access';
import type { Envelope } from '../common/http/envelope';
import { ZodBody, ZodParam, ZodQuery } from '../common/validation/zod.pipe';
import { OrdersService } from './orders.service';

const MINUTE = 60_000;

/** Customer (and guest, with X-Order-Token) order endpoints. */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  list(
    @CurrentAuth() auth: AuthContext,
    @ZodQuery(orderListQuerySchema) q: OrderListQuery,
  ): Promise<Envelope<OrderListItemDto[]>> {
    return this.orders.list(auth.userId, q);
  }

  /** Public order tracking: order number + the email or mobile used. */
  @Post('track')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE } })
  track(@ZodBody(trackOrderSchema) body: TrackOrderInput): Promise<TrackOrderDto> {
    return this.orders.track(body);
  }

  @Get(':orderNumber')
  @Header('Cache-Control', 'no-store')
  detail(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @Req() req: Request,
  ): Promise<OrderDetailDto> {
    return this.orders.detail(n, orderAccess(req));
  }

  @Post(':orderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  cancel(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @ZodBody(cancelOrderSchema) body: CancelOrderInput,
    @Req() req: Request,
  ): Promise<OrderDetailDto> {
    return this.orders.cancelByCustomer(n, orderAccess(req), body);
  }

  @Post(':orderNumber/returns')
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  requestReturn(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @ZodBody(returnRequestSchema) body: ReturnRequestInput,
    @Req() req: Request,
  ): Promise<OrderDetailDto> {
    return this.orders.requestReturn(n, orderAccess(req), body);
  }

  @Get(':orderNumber/invoice')
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  async invoice(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filename, pdf } = await this.orders.invoice(n, orderAccess(req));
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: pdf.length,
    });
  }
}

function actor(auth: AuthContext, req: Request) {
  return { userId: auth.userId, ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}

/**
 * Staff fulfilment actions (the admin dashboard arrives in Phase 10). Permission-gated
 * and audit-logged; every status change goes through the order state machine.
 */
@Controller('admin')
export class StaffOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders/:orderNumber')
  @RequirePermissions('orders:read')
  @Header('Cache-Control', 'no-store')
  detail(@ZodParam('orderNumber', orderNumberSchema) n: string): Promise<OrderDetailDto> {
    return this.orders.staffDetail(n);
  }

  @Post('orders/:orderNumber/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders:write')
  status(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @ZodBody(staffOrderStatusSchema) body: z.infer<typeof staffOrderStatusSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.orders.setStatus(n, body.status, body.note, actor(auth, req));
  }

  @Post('orders/:orderNumber/shipments')
  @RequirePermissions('orders:write')
  ship(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @ZodBody(createShipmentSchema) body: CreateShipmentInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.orders.addShipment(n, body, actor(auth, req));
  }

  @Post('orders/:orderNumber/shipments/events')
  @RequirePermissions('orders:write')
  event(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @ZodBody(shipmentEventSchema) body: ShipmentEventInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.orders.addShipmentEvent(n, body, actor(auth, req));
  }

  @Post('orders/:orderNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders:write')
  cancel(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @ZodBody(staffCancelSchema) body: z.infer<typeof staffCancelSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.orders.cancelByStaff(n, body.reason, actor(auth, req));
  }

  @Post('orders/:orderNumber/refunds')
  @RequirePermissions('orders:refund')
  refund(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @ZodBody(refundRequestSchema) body: z.infer<typeof refundRequestSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.orders.refund(n, body, actor(auth, req));
  }

  @Post('returns/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders:write')
  returnAction(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(returnActionSchema) body: ReturnActionInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.orders.actOnReturn(id, body, actor(auth, req));
  }

  @Post('refunds/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('orders:refund')
  completeManualRefund(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(manualRefundSchema) body: z.infer<typeof manualRefundSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ) {
    return this.orders.completeManualRefund(id, body.reference, actor(auth, req));
  }
}
