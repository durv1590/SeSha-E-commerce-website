import { Controller, Delete, Get, Header, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CartDto, CartSummaryDto } from '@seshakart/types';
import {
  addCartItemSchema,
  applyCouponSchema,
  idSchema,
  updateCartItemSchema,
  type AddCartItemInput,
  type ApplyCouponInput,
  type UpdateCartItemInput,
} from '@seshakart/validation';
import type { Request, Response } from 'express';
import { ZodBody, ZodParam } from '../common/validation/zod.pipe';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { SettingsService } from '../settings/settings.service';
import { readGuestToken, writeGuestToken } from './cart-cookie';
import { CartService, type CartOwner } from './cart.service';

const MINUTE = 60_000;

/**
 * Shopping cart for guests and signed-in customers. Prices, stock, coupons and
 * totals are always computed server-side from live data; the client only ever sends
 * a variant id, a quantity or a coupon code.
 */
@Controller('cart')
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private owner(req: Request): CartOwner {
    return { userId: req.auth?.userId ?? null, guestToken: readGuestToken(req) };
  }

  /** Issues a new guest token, or extends the current one's lifetime. */
  private async keepGuestToken(
    req: Request,
    res: Response,
    owner: CartOwner,
    newToken?: string | null,
  ) {
    const token = newToken ?? owner.guestToken;
    if (owner.userId || !token) return;
    const { cartRetentionDays } = await this.settings.get('commerce');
    writeGuestToken(req, res, this.env, token, cartRetentionDays);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  get(@Req() req: Request): Promise<CartDto> {
    return this.carts.get(this.owner(req));
  }

  /** Header badge: units in the cart. */
  @Get('summary')
  @Header('Cache-Control', 'no-store')
  summary(@Req() req: Request): Promise<CartSummaryDto> {
    return this.carts.summary(this.owner(req));
  }

  @Post('items')
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  async add(
    @ZodBody(addCartItemSchema) body: AddCartItemInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    const owner = this.owner(req);
    const { cart, newToken } = await this.carts.add(owner, body);
    await this.keepGuestToken(req, res, owner, newToken);
    return cart;
  }

  @Patch('items/:id')
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  async update(
    @ZodParam('id', idSchema) id: string,
    @ZodBody(updateCartItemSchema) body: UpdateCartItemInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    const owner = this.owner(req);
    const cart = await this.carts.update(owner, id, body);
    await this.keepGuestToken(req, res, owner);
    return cart;
  }

  @Delete('items/:id')
  @Throttle({ default: { limit: 120, ttl: MINUTE } })
  async remove(
    @ZodParam('id', idSchema) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CartDto> {
    const owner = this.owner(req);
    const cart = await this.carts.remove(owner, id);
    await this.keepGuestToken(req, res, owner);
    return cart;
  }

  /** Strict limit: stops guessing coupon codes. */
  @Post('coupon')
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE } })
  applyCoupon(
    @ZodBody(applyCouponSchema) body: ApplyCouponInput,
    @Req() req: Request,
  ): Promise<CartDto> {
    return this.carts.applyCoupon(this.owner(req), body.code);
  }

  @Delete('coupon')
  removeCoupon(@Req() req: Request): Promise<CartDto> {
    return this.carts.removeCoupon(this.owner(req));
  }
}
