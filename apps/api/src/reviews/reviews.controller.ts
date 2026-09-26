import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { MyReviewDto, ReviewablePurchaseDto } from '@seshakart/types';
import {
  idSchema,
  productReviewsQuerySchema,
  reviewInputSchema,
  slugSchema,
  type ProductReviewsQuery,
  type ReviewInput,
} from '@seshakart/validation';
import type { AuthContext } from '../auth/auth.types';
import { Authenticated, CurrentAuth } from '../auth/decorators';
import { Envelope } from '../common/http/envelope';
import { ZodBody, ZodParam, ZodQuery } from '../common/validation/zod.pipe';
import { ReviewsService } from './reviews.service';

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('products/:slug/reviews')
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async forProduct(
    @ZodParam('slug', slugSchema) slug: string,
    @ZodQuery(productReviewsQuerySchema) q: ProductReviewsQuery,
  ) {
    const { data, meta } = await this.reviews.forProduct(slug, q);
    return new Envelope(data, meta);
  }

  @Post('reviews')
  @Authenticated()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  submit(
    @CurrentAuth() auth: AuthContext,
    @ZodBody(reviewInputSchema) body: ReviewInput,
  ): Promise<MyReviewDto> {
    return this.reviews.submit(auth.userId, body);
  }

  @Delete('reviews/:id')
  @Authenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('id', idSchema) id: string,
  ): Promise<void> {
    await this.reviews.remove(auth.userId, id);
  }

  @Get('users/me/reviews')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  async mine(
    @CurrentAuth() auth: AuthContext,
  ): Promise<{ reviews: MyReviewDto[]; awaiting: ReviewablePurchaseDto[] }> {
    const [reviews, awaiting] = await Promise.all([
      this.reviews.mine(auth.userId),
      this.reviews.awaiting(auth.userId),
    ]);
    return { reviews, awaiting };
  }

  @Get('users/me/reviews/eligibility/:productId')
  @Authenticated()
  @Header('Cache-Control', 'no-store')
  eligibility(
    @CurrentAuth() auth: AuthContext,
    @ZodParam('productId', idSchema) productId: string,
  ) {
    return this.reviews.eligibility(auth.userId, productId);
  }
}
