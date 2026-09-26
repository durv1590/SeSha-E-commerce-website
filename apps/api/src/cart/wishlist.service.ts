import { HttpStatus, Injectable } from '@nestjs/common';
import type { CartDto, WishlistItemDto } from '@seshakart/types';
import { CategoryService } from '../catalog/category.service';
import { summaryInclude, toSummary } from '../catalog/product.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../database/prisma.service';
import { CartService } from './cart.service';

/** Generous, but bounded: a wishlist is a list, not a second catalogue. */
export const MAX_WISHLIST_ITEMS = 200;

/**
 * Server-side wishlist for signed-in customers. Prices and stock are always live;
 * withdrawn products stay listed (marked unavailable) so shoppers see what happened.
 */
@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoryService,
    private readonly carts: CartService,
  ) {}

  private async wishlistId(userId: string): Promise<string> {
    const w = await this.prisma.wishlist.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    return w.id;
  }

  async list(userId: string): Promise<WishlistItemDto[]> {
    const [rows, idx] = await Promise.all([
      this.prisma.wishlistItem.findMany({
        where: { wishlist: { userId } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        include: { product: { include: summaryInclude } },
      }),
      this.categories.index(),
    ]);
    const now = Date.now();
    return rows.map(({ product, createdAt }) => {
      const s = toSummary(product, now);
      const available = product.status === 'ACTIVE' && Boolean(idx.byId[product.categoryId]);
      return {
        productId: s.id,
        slug: s.slug,
        name: s.name,
        brand: s.brand?.name ?? null,
        image: s.image,
        price: s.price,
        mrp: s.mrp,
        stock: available ? s.stock : 'out_of_stock',
        defaultVariantId: available ? s.defaultVariantId : null,
        hasMultipleVariants: s.hasMultipleVariants,
        available,
        addedAt: createdAt.toISOString(),
      };
    });
  }

  async ids(userId: string): Promise<string[]> {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { wishlist: { userId } },
      select: { productId: true },
    });
    return rows.map((r) => r.productId);
  }

  async add(userId: string, productId: string): Promise<string[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { status: true, categoryId: true },
    });
    const idx = await this.categories.index();
    if (!product || product.status !== 'ACTIVE' || !idx.byId[product.categoryId])
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_UNAVAILABLE',
        'This product is no longer available.',
      );
    const wishlistId = await this.wishlistId(userId);
    const exists = await this.prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId, productId } },
    });
    if (!exists) {
      if ((await this.prisma.wishlistItem.count({ where: { wishlistId } })) >= MAX_WISHLIST_ITEMS)
        throw new AppException(
          HttpStatus.CONFLICT,
          'WISHLIST_FULL',
          `Your wishlist can hold up to ${MAX_WISHLIST_ITEMS} products. Remove some to add more.`,
        );
      // Concurrent double-taps: the unique index makes the second insert a no-op.
      await this.prisma.wishlistItem.createMany({
        data: [{ wishlistId, productId }],
        skipDuplicates: true,
      });
    }
    return this.ids(userId);
  }

  async remove(userId: string, productId: string): Promise<string[]> {
    await this.prisma.wishlistItem.deleteMany({ where: { productId, wishlist: { userId } } });
    return this.ids(userId);
  }

  /**
   * Adds the chosen (or default purchasable) variant to the cart, then removes the
   * product from the wishlist. Products with several variants need a choice.
   */
  async moveToCart(userId: string, productId: string, variantId?: string): Promise<CartDto> {
    const item = await this.prisma.wishlistItem.findFirst({
      where: { productId, wishlist: { userId } },
      include: { product: { include: summaryInclude } },
    });
    if (!item)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'This item is not in your wishlist.',
      );
    const summary = toSummary(item.product);
    let chosen = variantId;
    if (chosen && !item.product.variants.some((v) => v.id === chosen))
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_UNAVAILABLE',
        'This option is no longer available.',
      );
    if (!chosen) {
      if (summary.hasMultipleVariants)
        throw new AppException(
          HttpStatus.CONFLICT,
          'VARIANT_REQUIRED',
          'Choose an option on the product page to add it to your cart.',
        );
      chosen = summary.defaultVariantId ?? undefined;
    }
    if (!chosen)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_UNAVAILABLE',
        'This product is no longer available.',
      );
    const { cart } = await this.carts.add(
      { userId, guestToken: null },
      { variantId: chosen, quantity: 1 },
    );
    await this.prisma.wishlistItem.delete({ where: { id: item.id } });
    return cart;
  }
}
