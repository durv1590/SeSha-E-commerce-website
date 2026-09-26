import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { CartDto, WishlistItemDto } from '@seshakart/types';
import {
  addWishlistItemSchema,
  idSchema,
  moveToCartSchema,
  type AddWishlistItemInput,
  type MoveToCartInput,
} from '@seshakart/validation';
import type { AuthContext } from '../auth/auth.types';
import { Authenticated, CurrentAuth } from '../auth/decorators';
import { ZodBody, ZodParam } from '../common/validation/zod.pipe';
import { WishlistService } from './wishlist.service';

const MINUTE = 60_000;

@Controller('wishlist')
@Authenticated()
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentAuth() auth: AuthContext): Promise<WishlistItemDto[]> {
    return this.wishlist.list(auth.userId);
  }

  /** Product ids only, for heart icons across the storefront. */
  @Get('ids')
  @Header('Cache-Control', 'no-store')
  ids(@CurrentAuth() auth: AuthContext): Promise<string[]> {
    return this.wishlist.ids(auth.userId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  add(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(addWishlistItemSchema) body: AddWishlistItemInput,
  ): Promise<string[]> {
    return this.wishlist.add(auth.userId, body.productId);
  }

  @Delete(':productId')
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  remove(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('productId', idSchema) productId: string,
  ): Promise<string[]> {
    return this.wishlist.remove(auth.userId, productId);
  }

  @Post(':productId/move-to-cart')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: MINUTE } })
  moveToCart(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('productId', idSchema) productId: string,
    @ZodBody(moveToCartSchema) body: MoveToCartInput,
  ): Promise<CartDto> {
    return this.wishlist.moveToCart(auth.userId, productId, body.variantId);
  }
}
