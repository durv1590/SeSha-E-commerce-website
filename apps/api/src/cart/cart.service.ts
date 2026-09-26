import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CartDto, CartLineDto, CartLineIssue, CartSummaryDto } from '@seshakart/types';
import {
  MAX_CART_LINES,
  MAX_CART_QUANTITY,
  type AddCartItemInput,
  type UpdateCartItemInput,
} from '@seshakart/validation';
import { hmac, randomToken } from '../auth/crypto';
import { CategoryService, type TreeIndex } from '../catalog/category.service';
import { stockState } from '../catalog/product.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { evaluateCoupon, priceCart, type PricingLine } from './pricing';

/**
 * Who a cart belongs to: a signed-in user, or a guest identified by a random token
 * (HttpOnly cookie for browsers, `X-Cart-Token` for apps). Only the token's HMAC is
 * stored, so a database leak can't be replayed into someone's cart.
 */
export interface CartOwner {
  userId: string | null;
  guestToken: string | null;
}

const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

const lineInclude = {
  variant: {
    include: {
      inventory: { select: { stock: true, reserved: true, lowStockThreshold: true } },
      images: {
        orderBy: { position: 'asc' },
        take: 1,
        select: { url: true, alt: true, width: true, height: true },
      },
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          categoryId: true,
          taxRate: true,
          images: {
            orderBy: { position: 'asc' },
            take: 1,
            select: { url: true, alt: true, width: true, height: true },
          },
          _count: { select: { variants: { where: { isActive: true } } } },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type LineRow = Prisma.CartItemGetPayload<{ include: typeof lineInclude }>;
type CartWithLines = Prisma.CartGetPayload<{
  include: { items: { include: typeof lineInclude } };
}>;

/** The product's category and its ancestors; empty when the category is hidden. */
export function categoryPath(idx: TreeIndex, categoryId: string): string[] {
  const path: string[] = [];
  let slug: string | null | undefined = idx.byId[categoryId];
  while (slug) {
    const entry: TreeIndex['bySlug'][string] | undefined = idx.bySlug[slug];
    if (!entry) break;
    path.push(entry.node.id);
    slug = entry.parentSlug;
  }
  return path;
}

@Injectable()
export class CartService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Cart');
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoryService,
    private readonly settings: SettingsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test') return;
    this.purgeTimer = setInterval(() => void this.purgeStale(), PURGE_INTERVAL_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.purgeTimer);
  }

  hashToken(token: string): string {
    return hmac(this.env.SESSION_SECRET, `cart:${token}`);
  }

  private where(owner: CartOwner): Prisma.CartWhereUniqueInput | null {
    if (owner.userId) return { userId: owner.userId };
    if (owner.guestToken) return { guestTokenHash: this.hashToken(owner.guestToken) };
    return null;
  }

  private find(owner: CartOwner): Promise<CartWithLines | null> {
    const where = this.where(owner);
    if (!where) return Promise.resolve(null);
    return this.prisma.cart.findUnique({
      where,
      include: { items: { include: lineInclude, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] } },
    });
  }

  /**
   * The owner's cart, created on first write. Returns a new guest token when one was
   * issued (the controller hands it to the client).
   */
  private async ensure(owner: CartOwner): Promise<{ cartId: string; newToken: string | null }> {
    if (owner.userId) {
      const cart = await this.prisma.cart.upsert({
        where: { userId: owner.userId },
        create: { userId: owner.userId },
        update: { updatedAt: new Date() },
        select: { id: true },
      });
      return { cartId: cart.id, newToken: null };
    }
    if (owner.guestToken) {
      const existing = await this.prisma.cart.findUnique({
        where: { guestTokenHash: this.hashToken(owner.guestToken) },
        select: { id: true },
      });
      if (existing) {
        await this.touch(existing.id);
        return { cartId: existing.id, newToken: null };
      }
    }
    const token = randomToken();
    const cart = await this.prisma.cart.create({
      data: { guestTokenHash: this.hashToken(token) },
      select: { id: true },
    });
    return { cartId: cart.id, newToken: token };
  }

  /** Line changes don't update the cart row; stale-cart purging relies on updatedAt. */
  private touch(cartId: string) {
    return this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }

  // ------------------------------------------------------------------ reads

  async get(owner: CartOwner): Promise<CartDto> {
    return this.build(await this.find(owner), owner.userId);
  }

  async summary(owner: CartOwner): Promise<CartSummaryDto> {
    const where = this.where(owner);
    if (!where) return { count: 0 };
    const agg = await this.prisma.cartItem.aggregate({
      where: { cart: where, savedForLater: false },
      _sum: { quantity: true },
    });
    return { count: agg._sum.quantity ?? 0 };
  }

  private async build(cart: CartWithLines | null, userId: string | null): Promise<CartDto> {
    const [commerce, idx] = await Promise.all([
      this.settings.get('commerce'),
      this.categories.index(),
    ]);
    const maxPer = Math.min(commerce.maxQuantityPerItem, MAX_CART_QUANTITY);
    const lines = (cart?.items ?? []).map((row) => this.toLine(row, idx, maxPer));

    const active = lines.filter((l) => !l.dto.savedForLater);
    const purchasable = active.filter((l) => l.dto.issue === null);
    const pricingLines = purchasable.map((l) => l.pricing);

    let coupon: CartDto['coupon'] = null;
    let applied: Extract<ReturnType<typeof evaluateCoupon>, { ok: true }> | null = null;
    if (cart?.couponCode) {
      const row = await this.prisma.coupon.findUnique({ where: { code: cart.couponCode } });
      if (!row) {
        coupon = {
          code: cart.couponCode,
          valid: false,
          discount: 0,
          message: 'This coupon code isn’t valid.',
        };
      } else {
        const result = evaluateCoupon(row, pricingLines, await this.couponContext(row.id, userId));
        if (result.ok) applied = result;
        coupon = {
          code: row.code,
          valid: result.ok,
          discount: result.ok ? result.discount : 0,
          message: result.ok ? row.description : result.message,
        };
      }
    }

    const totals = priceCart(pricingLines, applied, {
      freeShippingThreshold: commerce.freeShippingThreshold,
      standardShippingFee: commerce.standardShippingFee,
    });
    return {
      id: cart?.id ?? null,
      items: active.map((l) => l.dto),
      savedForLater: lines.filter((l) => l.dto.savedForLater).map((l) => l.dto),
      coupon,
      totals: {
        itemCount: totals.itemCount,
        mrpTotal: totals.mrpTotal,
        subtotal: totals.subtotal,
        productDiscount: totals.productDiscount,
        couponDiscount: totals.couponDiscount,
        shippingFee: totals.shippingFee,
        taxIncluded: totals.taxIncluded,
        total: totals.total,
        freeShippingRemaining: totals.freeShippingRemaining,
        freeShippingThreshold: commerce.freeShippingThreshold,
      },
      canCheckout: purchasable.length > 0 && purchasable.length === active.length,
      maxQuantityPerItem: maxPer,
    };
  }

  private toLine(
    row: LineRow,
    idx: TreeIndex,
    maxPer: number,
  ): { dto: CartLineDto; pricing: PricingLine } {
    const { variant } = row;
    const { product } = variant;
    const path = categoryPath(idx, product.categoryId);
    const inv = variant.inventory;
    const available = Math.max(0, (inv?.stock ?? 0) - (inv?.reserved ?? 0));
    const withdrawn = product.status !== 'ACTIVE' || !variant.isActive || path.length === 0;
    const maxQuantity = withdrawn ? 0 : Math.min(available, maxPer);
    let issue: CartLineIssue | null = null;
    if (withdrawn) issue = 'UNAVAILABLE';
    else if (available === 0) issue = 'OUT_OF_STOCK';
    else if (row.quantity > maxQuantity) issue = 'INSUFFICIENT_STOCK';

    const options = (variant.options ?? {}) as Record<string, string>;
    return {
      dto: {
        id: row.id,
        productId: product.id,
        variantId: variant.id,
        slug: product.slug,
        name: product.name,
        variantName:
          product._count.variants > 1 || Object.keys(options).length ? variant.name : null,
        options,
        image: variant.images[0] ?? product.images[0] ?? null,
        quantity: row.quantity,
        price: variant.price,
        mrp: variant.mrp,
        lineTotal: variant.price * row.quantity,
        maxQuantity,
        stock: withdrawn ? 'out_of_stock' : stockState(available, inv?.lowStockThreshold ?? 5),
        issue,
        savedForLater: row.savedForLater,
      },
      pricing: {
        key: row.id,
        productId: product.id,
        categoryPath: path,
        unitPrice: variant.price,
        unitMrp: variant.mrp,
        quantity: row.quantity,
        taxRate: product.taxRate,
      },
    };
  }

  private async couponContext(couponId: string, userId: string | null) {
    if (!userId) return { now: new Date(), userId: null, previousOrders: 0, timesUsedByUser: 0 };
    const [previousOrders, timesUsedByUser] = await Promise.all([
      this.prisma.order.count({ where: { userId, status: { not: 'CANCELLED' } } }),
      this.prisma.couponUsage.count({ where: { couponId, userId } }),
    ]);
    return { now: new Date(), userId, previousOrders, timesUsedByUser };
  }

  // ------------------------------------------------------------------ writes

  /** Live purchasability of a variant, or a customer-facing error. */
  private async purchasable(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        isActive: true,
        inventory: { select: { stock: true, reserved: true } },
        product: { select: { status: true, categoryId: true } },
      },
    });
    const idx = await this.categories.index();
    if (
      !variant ||
      !variant.isActive ||
      variant.product.status !== 'ACTIVE' ||
      !idx.byId[variant.product.categoryId]
    ) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'PRODUCT_UNAVAILABLE',
        'This product is no longer available.',
      );
    }
    const available = Math.max(
      0,
      (variant.inventory?.stock ?? 0) - (variant.inventory?.reserved ?? 0),
    );
    if (available === 0)
      throw new AppException(HttpStatus.CONFLICT, 'OUT_OF_STOCK', 'This item is out of stock.');
    return { available };
  }

  private async assertQuantity(quantity: number, available: number): Promise<void> {
    const maxPer = Math.min(
      (await this.settings.get('commerce')).maxQuantityPerItem,
      MAX_CART_QUANTITY,
    );
    if (quantity > maxPer)
      throw new AppException(
        HttpStatus.CONFLICT,
        'QUANTITY_LIMIT',
        `You can buy up to ${maxPer} of this item per order.`,
      );
    if (quantity > available)
      throw new AppException(
        HttpStatus.CONFLICT,
        'INSUFFICIENT_STOCK',
        available === 1 ? 'Only 1 left in stock.' : `Only ${available} left in stock.`,
      );
  }

  async add(owner: CartOwner, input: AddCartItemInput) {
    const { available } = await this.purchasable(input.variantId);
    const { cartId, newToken } = await this.ensure(owner);
    const existing = await this.prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId: input.variantId } },
    });
    // Adding something saved for later moves it back into the cart.
    const quantity =
      existing && !existing.savedForLater ? existing.quantity + input.quantity : input.quantity;
    await this.assertQuantity(quantity, available);
    if (!existing && (await this.prisma.cartItem.count({ where: { cartId } })) >= MAX_CART_LINES) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'CART_FULL',
        `Your cart can hold up to ${MAX_CART_LINES} different items.`,
      );
    }
    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId: input.variantId } },
      create: { cartId, variantId: input.variantId, quantity },
      update: { quantity, savedForLater: false },
    });
    // A newly issued guest token identifies the cart from now on.
    const current = newToken ? { ...owner, guestToken: newToken } : owner;
    return { cart: await this.get(current), newToken };
  }

  private async ownedItem(owner: CartOwner, itemId: string) {
    const where = this.where(owner);
    const item = where
      ? await this.prisma.cartItem.findFirst({ where: { id: itemId, cart: where } })
      : null;
    if (!item)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'This item is no longer in your cart.',
      );
    return item;
  }

  async update(owner: CartOwner, itemId: string, input: UpdateCartItemInput): Promise<CartDto> {
    const item = await this.ownedItem(owner, itemId);
    const quantity = input.quantity ?? item.quantity;
    const savedForLater = input.savedForLater ?? item.savedForLater;
    // Validate when the line (re-)enters the cart or grows; reducing is always allowed.
    const entering = item.savedForLater && !savedForLater;
    if (!savedForLater && (entering || quantity > item.quantity)) {
      const { available } = await this.purchasable(item.variantId);
      await this.assertQuantity(quantity, available);
    }
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity, savedForLater },
    });
    await this.touch(item.cartId);
    return this.get(owner);
  }

  async remove(owner: CartOwner, itemId: string): Promise<CartDto> {
    const item = await this.ownedItem(owner, itemId);
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    await this.touch(item.cartId);
    return this.get(owner);
  }

  async applyCoupon(owner: CartOwner, code: string): Promise<CartDto> {
    const cart = await this.find(owner);
    const invalid = (message: string) =>
      new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'COUPON_INVALID', message);
    if (!cart || !cart.items.some((i) => !i.savedForLater))
      throw invalid('Add items to your cart to use a coupon.');
    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon) throw invalid('This coupon code isn’t valid.');
    const dto = await this.build({ ...cart, couponCode: code }, owner.userId);
    if (!dto.coupon?.valid) throw invalid(dto.coupon?.message ?? 'This coupon code isn’t valid.');
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code } });
    return this.get(owner);
  }

  async removeCoupon(owner: CartOwner): Promise<CartDto> {
    const where = this.where(owner);
    if (where)
      await this.prisma.cart.updateMany({
        where: where as Prisma.CartWhereInput,
        data: { couponCode: null },
      });
    return this.get(owner);
  }

  // ------------------------------------------------------------------ lifecycle

  /**
   * On sign-in, the guest cart joins the account's cart: quantities for the same
   * variant add up (capped at the per-item limit), and a line is active if it is
   * active in either cart. Stock is re-checked when the cart is read.
   */
  async mergeGuestCart(userId: string, guestToken: string): Promise<void> {
    const guest = await this.prisma.cart.findUnique({
      where: { guestTokenHash: this.hashToken(guestToken) },
      include: { items: true },
    });
    if (!guest) return;
    const maxPer = Math.min(
      (await this.settings.get('commerce')).maxQuantityPerItem,
      MAX_CART_QUANTITY,
    );
    await this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.upsert({
        where: { userId },
        create: { userId, couponCode: guest.couponCode },
        update: {},
        include: { items: true },
      });
      const mine = new Map(cart.items.map((i) => [i.variantId, i]));
      let lines = cart.items.length;
      for (const g of guest.items) {
        const m = mine.get(g.variantId);
        if (m) {
          const bothActive = !m.savedForLater && !g.savedForLater;
          await tx.cartItem.update({
            where: { id: m.id },
            data: {
              quantity: bothActive
                ? Math.min(m.quantity + g.quantity, maxPer)
                : Math.max(m.quantity, g.quantity),
              savedForLater: m.savedForLater && g.savedForLater,
            },
          });
        } else if (lines < MAX_CART_LINES) {
          await tx.cartItem.create({
            data: {
              cartId: cart.id,
              variantId: g.variantId,
              quantity: Math.min(g.quantity, maxPer),
              savedForLater: g.savedForLater,
            },
          });
          lines += 1;
        }
      }
      if (!cart.couponCode && guest.couponCode)
        await tx.cart.update({ where: { id: cart.id }, data: { couponCode: guest.couponCode } });
      else await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
      await tx.cart.delete({ where: { id: guest.id } });
    });
  }

  /** Deletes guest carts nobody has touched for `cartRetentionDays`. */
  async purgeStale(): Promise<number> {
    try {
      const { cartRetentionDays } = await this.settings.get('commerce');
      const cutoff = new Date(Date.now() - cartRetentionDays * 86_400_000);
      const { count } = await this.prisma.cart.deleteMany({
        where: { userId: null, updatedAt: { lt: cutoff } },
      });
      if (count) this.logger.log(`Purged ${count} stale guest carts`);
      return count;
    } catch (err) {
      this.logger.warn(`Stale cart purge failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
