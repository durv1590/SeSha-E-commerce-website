import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type {
  AdminCouponDto,
  AdminOrderDto,
  AdminOrderListItemDto,
  AdminReturnListItemDto,
  CustomerDetailDto,
  CustomerListItemDto,
} from '@seshakart/types';
import {
  adminOrderListQuerySchema,
  adminReturnListQuerySchema,
  couponInputSchema,
  couponListQuerySchema,
  customerListQuerySchema,
  customerStatusSchema,
  idSchema,
  orderNumberSchema,
  type AdminOrderListQuery,
  type AdminReturnListQuery,
  type CouponInput,
  type CouponListQuery,
  type CustomerListQuery,
  type CustomerStatusInput,
} from '@seshakart/validation';
import type { Request, Response } from 'express';
import type { AuthContext } from '../../auth/auth.types';
import { CurrentAuth, RequirePermissions } from '../../auth/decorators';
import { Envelope } from '../../common/http/envelope';
import { ZodBody, ZodParam, ZodQuery, ZodValidationPipe } from '../../common/validation/zod.pipe';
import { actorOf } from '../actor';
import { CouponsAdminService } from './coupons-admin.service';
import { CustomersAdminService } from './customers-admin.service';
import { OrdersAdminService } from './orders-admin.service';

/** Order queues and the full staff order view (actions live in StaffOrdersController). */
@Controller('admin')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersAdminService) {}

  @Get('orders')
  @RequirePermissions('orders:read')
  @Header('Cache-Control', 'no-store')
  async list(
    @ZodQuery(adminOrderListQuerySchema) q: AdminOrderListQuery,
  ): Promise<Envelope<AdminOrderListItemDto[]>> {
    const { data, meta } = await this.orders.list(q);
    return new Envelope(data, meta);
  }

  @Get('orders/export.csv')
  @RequirePermissions('orders:read')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async export(
    @Query(new ZodValidationPipe(adminOrderListQuerySchema)) q: AdminOrderListQuery,
    @Res() res: Response,
  ): Promise<void> {
    const body = await this.orders.export(q);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="seshakart-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
        'Cache-Control': 'no-store',
      })
      .send(`\uFEFF${body}`);
  }

  @Get('orders/:orderNumber')
  @RequirePermissions('orders:read')
  @Header('Cache-Control', 'no-store')
  detail(@ZodParam('orderNumber', orderNumberSchema) n: string): Promise<AdminOrderDto> {
    return this.orders.detail(n);
  }

  @Get('orders/:orderNumber/invoice')
  @RequirePermissions('orders:read')
  async invoice(
    @ZodParam('orderNumber', orderNumberSchema) n: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { filename, pdf } = await this.orders.invoice(n);
    res.setHeader('Cache-Control', 'private, no-store');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
      length: pdf.length,
    });
  }

  @Get('returns')
  @RequirePermissions('orders:read')
  @Header('Cache-Control', 'no-store')
  async returns(
    @ZodQuery(adminReturnListQuerySchema) q: AdminReturnListQuery,
  ): Promise<Envelope<AdminReturnListItemDto[]>> {
    const { data, meta } = await this.orders.returns(q);
    return new Envelope(data, meta);
  }
}

@Controller('admin/customers')
export class CustomersAdminController {
  constructor(private readonly customers: CustomersAdminService) {}

  @Get()
  @RequirePermissions('customers:read')
  @Header('Cache-Control', 'no-store')
  async list(
    @ZodQuery(customerListQuerySchema) q: CustomerListQuery,
  ): Promise<Envelope<CustomerListItemDto[]>> {
    const { data, meta } = await this.customers.list(q);
    return new Envelope(data, meta);
  }

  @Get(':id')
  @RequirePermissions('customers:read')
  @Header('Cache-Control', 'no-store')
  detail(@ZodParam('id', idSchema) id: string): Promise<CustomerDetailDto> {
    return this.customers.detail(id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('customers:write')
  status(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(customerStatusSchema) body: CustomerStatusInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<CustomerDetailDto> {
    return this.customers.setStatus(id, body, actorOf(auth, req));
  }
}

@Controller('admin/coupons')
export class CouponsAdminController {
  constructor(private readonly coupons: CouponsAdminService) {}

  @Get()
  @RequirePermissions('coupons:write')
  @Header('Cache-Control', 'no-store')
  async list(
    @ZodQuery(couponListQuerySchema) q: CouponListQuery,
  ): Promise<Envelope<AdminCouponDto[]>> {
    const { data, meta } = await this.coupons.list(q);
    return new Envelope(data, meta);
  }

  @Get(':id')
  @RequirePermissions('coupons:write')
  @Header('Cache-Control', 'no-store')
  get(@ZodParam('id', idSchema) id: string): Promise<AdminCouponDto> {
    return this.coupons.get(id);
  }

  @Post()
  @RequirePermissions('coupons:write')
  create(
    @ZodBody(couponInputSchema) body: CouponInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminCouponDto> {
    return this.coupons.create(body, actorOf(auth, req));
  }

  @Put(':id')
  @RequirePermissions('coupons:write')
  update(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(couponInputSchema) body: CouponInput,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<AdminCouponDto> {
    return this.coupons.update(id, body, actorOf(auth, req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('coupons:write')
  async remove(
    @ZodParam('id', idSchema) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.coupons.remove(id, actorOf(auth, req));
  }
}
