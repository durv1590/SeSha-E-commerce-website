import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  MyReviewDto,
  PaginationMeta,
  ReviewablePurchaseDto,
  ReviewDto,
  ReviewSummaryDto,
} from '@seshakart/types';
import type { ProductReviewsQuery, ReviewInput } from '@seshakart/validation';
import { CacheService } from '../cache/cache.service';
import { CATALOG_CACHE_PREFIX } from '../catalog/category.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../database/prisma.service';
import { recomputeRating, reviewerName } from './rating';

/** Orders whose goods reached the customer (a review needs a received product). */
const RECEIVED: Prisma.OrderWhereInput = { deliveredAt: { not: null } };

/**
 * Customer reviews. Only customers who received the product can review it (every
 * review is a verified purchase), one review per product; edits go back to
 * moderation. Ratings shown on the store count approved reviews only.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async forProduct(
    slug: string,
    q: ProductReviewsQuery,
  ): Promise<{ data: { summary: ReviewSummaryDto; reviews: ReviewDto[] }; meta: PaginationMeta }> {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE' },
      select: { id: true, ratingAvg: true, ratingCount: true },
    });
    if (!product)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This product isn’t available.');
    const summary = await this.cache.wrap(
      `${CATALOG_CACHE_PREFIX}reviews:${product.id}`,
      300,
      async () => {
        const dist = await this.prisma.review.groupBy({
          by: ['rating'],
          where: { productId: product.id, status: 'APPROVED' },
          _count: true,
        });
        const distribution = [1, 2, 3, 4, 5].map(
          (r) => dist.find((d) => d.rating === r)?._count ?? 0,
        ) as ReviewSummaryDto['distribution'];
        return { average: product.ratingAvg, count: product.ratingCount, distribution };
      },
    );
    const where: Prisma.ReviewWhereInput = {
      productId: product.id,
      status: 'APPROVED',
      ...(q.rating ? { rating: q.rating } : {}),
    };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      q.sort === 'highest'
        ? [{ rating: 'desc' }, { createdAt: 'desc' }]
        : q.sort === 'lowest'
          ? [{ rating: 'asc' }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }];
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { user: { select: { name: true } } },
      }),
    ]);
    return {
      data: {
        summary,
        reviews: rows.map((r) => ({
          id: r.id,
          rating: r.rating,
          title: r.title,
          body: r.body,
          author: reviewerName(r.user.name),
          isVerifiedPurchase: r.isVerifiedPurchase,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  /** Writes (or rewrites) the customer's review; it waits for moderation either way. */
  async submit(userId: string, input: ReviewInput): Promise<MyReviewDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true },
    });
    if (!product)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This product doesn’t exist.');
    const purchase = await this.prisma.orderItem.findFirst({
      where: { productId: product.id, order: { userId, ...RECEIVED } },
      orderBy: { order: { deliveredAt: 'desc' } },
      select: { id: true },
    });
    if (!purchase)
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'NOT_PURCHASED',
        'You can review products once they’ve been delivered to you.',
      );
    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId: product.id, userId } },
    });
    const data = {
      rating: input.rating,
      title: input.title,
      body: input.body,
      status: 'PENDING' as const,
      moderatedAt: null,
      moderatedById: null,
      moderationNote: null,
    };
    const review = await this.prisma.$transaction(async (tx) => {
      const r = existing
        ? await tx.review.update({ where: { id: existing.id }, data })
        : await tx.review.create({
            data: {
              ...data,
              productId: product.id,
              userId,
              orderItemId: purchase.id,
              isVerifiedPurchase: true,
            },
          });
      // An edited review that was live comes down until it is approved again.
      if (existing?.status === 'APPROVED') await recomputeRating(tx, product.id);
      return r;
    });
    if (existing?.status === 'APPROVED') await this.cache.delByPrefix(CATALOG_CACHE_PREFIX);
    return (await this.mine(userId, review.id))[0]!;
  }

  async remove(userId: string, id: string): Promise<void> {
    const r = await this.prisma.review.findFirst({ where: { id, userId } });
    if (!r) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Review not found.');
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id } });
      if (r.status === 'APPROVED') await recomputeRating(tx, r.productId);
    });
    if (r.status === 'APPROVED') await this.cache.delByPrefix(CATALOG_CACHE_PREFIX);
  }

  async mine(userId: string, onlyId?: string): Promise<MyReviewDto[]> {
    const rows = await this.prisma.review.findMany({
      where: { userId, ...(onlyId ? { id: onlyId } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      product: {
        id: r.product.id,
        name: r.product.name,
        slug: r.product.slug,
        imageUrl: r.product.images[0]?.url ?? null,
      },
      rating: r.rating,
      title: r.title,
      body: r.body,
      status: r.status,
      moderationNote: r.status === 'REJECTED' ? r.moderationNote : null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  /** Delivered products (still on sale) the customer hasn't reviewed, newest first. */
  async awaiting(userId: string): Promise<ReviewablePurchaseDto[]> {
    const rows = await this.prisma.$queryRaw<
      {
        product_id: string;
        name: string;
        slug: string;
        image_url: string | null;
        delivered_at: Date;
      }[]
    >`
      SELECT p."id" AS product_id, p."name", p."slug", max(o."delivered_at") AS delivered_at,
             (SELECT pi."url" FROM "product_images" pi WHERE pi."product_id" = p."id" ORDER BY pi."position" LIMIT 1) AS image_url
      FROM "order_items" oi
      JOIN "orders" o ON o."id" = oi."order_id" AND o."user_id" = ${userId} AND o."delivered_at" IS NOT NULL
      JOIN "products" p ON p."id" = oi."product_id" AND p."status" = 'ACTIVE'
      WHERE NOT EXISTS (SELECT 1 FROM "reviews" r WHERE r."product_id" = p."id" AND r."user_id" = ${userId})
      GROUP BY p."id"
      ORDER BY delivered_at DESC
      LIMIT 20`;
    return rows.map((r) => ({
      productId: r.product_id,
      name: r.name,
      slug: r.slug,
      imageUrl: r.image_url,
      deliveredAt: r.delivered_at.toISOString(),
    }));
  }

  /** For the product page: can this customer review, and have they already? */
  async eligibility(
    userId: string,
    productId: string,
  ): Promise<{ canReview: boolean; review: MyReviewDto | null }> {
    const [purchase, existing] = await Promise.all([
      this.prisma.orderItem.findFirst({
        where: { productId, order: { userId, ...RECEIVED } },
        select: { id: true },
      }),
      this.prisma.review.findUnique({
        where: { productId_userId: { productId, userId } },
        select: { id: true },
      }),
    ]);
    return {
      canReview: Boolean(purchase),
      review: existing ? ((await this.mine(userId, existing.id))[0] ?? null) : null,
    };
  }
}
