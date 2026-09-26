import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Order, type OrderItem, type Payment } from '@prisma/client';
import type {
  CheckoutQuoteDto,
  OrderAddressDto,
  OrderSummaryDto,
  PlaceOrderResultDto,
} from '@seshakart/types';
import {
  ADDRESS_LIMIT,
  type CheckoutQuoteInput,
  type PlaceOrderInput,
} from '@seshakart/validation';
import type { CartOwner } from '../cart/cart.service';
import { CartService, type CartSnapshot } from '../cart/cart.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { checkoutOptions } from './checkout-options';
import { reserve, sell } from './inventory';
import { guestTokenFor, hashGuestToken, type OrderAccess } from './order-access';
import { PaymentsService } from './payments.service';

type OrderWithLines = Order & { items: OrderItem[]; payments: Payment[] };

/** SK + YYMMDD (India time) + sequence, e.g. SK260926001042. */
export function formatOrderNumber(seq: bigint | number, now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const ymd = ist.toISOString().slice(2, 10).replace(/-/g, '');
  return `SK${ymd}${String(seq).padStart(6, '0')}`;
}

function toAddress(a: OrderAddressDto | Record<string, unknown>): OrderAddressDto {
  const v = a as Record<string, string | null | undefined>;
  return {
    name: v.name ?? '',
    phone: v.phone ?? '',
    line1: v.line1 ?? '',
    line2: v.line2 ?? null,
    landmark: v.landmark ?? null,
    city: v.city ?? '',
    state: v.state ?? '',
    pincode: v.pincode ?? '',
    country: v.country ?? 'IN',
  };
}

export function formatAddress(a: OrderAddressDto): string {
  return [a.name, a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`]
    .filter(Boolean)
    .join(', ');
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger('Checkout');

  constructor(
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private async priced(snapshot: CartSnapshot, input: CheckoutQuoteInput) {
    const commerce = await this.settings.get('commerce');
    const productIds = [...new Set(snapshot.dto.items.map((i) => i.productId))];
    const codBlocked = productIds.length
      ? await this.prisma.product.count({
          where: { id: { in: productIds }, isCodAvailable: false },
        })
      : 0;
    return checkoutOptions(
      snapshot.dto.totals,
      commerce,
      { delivery: input.deliveryMethod, payment: input.paymentMethod },
      codBlocked === 0,
    );
  }

  async quote(owner: CartOwner, input: CheckoutQuoteInput): Promise<CheckoutQuoteDto> {
    const snapshot = await this.carts.snapshot(owner);
    const o = await this.priced(snapshot, input);
    return {
      cart: snapshot.dto,
      deliveryOptions: o.deliveryOptions,
      paymentOptions: o.paymentOptions,
      totals: o.totals,
      canPlaceOrder: snapshot.dto.canCheckout && o.deliveryAvailable && o.paymentAvailable,
    };
  }

  // ------------------------------------------------------------------ place order

  async placeOrder(owner: CartOwner, input: PlaceOrderInput): Promise<PlaceOrderResultDto> {
    const guestToken = owner.userId
      ? null
      : guestTokenFor(this.env.SESSION_SECRET, input.idempotencyKey, owner.guestToken);

    // A retried request (double click, dropped connection) returns the same order.
    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (existing) return this.replay(existing, owner, guestToken);

    const snapshot = await this.carts.snapshot(owner);
    const cart = snapshot.dto;
    if (!cart.items.length)
      throw new AppException(HttpStatus.CONFLICT, 'CART_EMPTY', 'Your cart is empty.');
    if (!cart.canCheckout)
      throw new AppException(
        HttpStatus.CONFLICT,
        'CART_NEEDS_ATTENTION',
        'Some items in your cart need your attention. Please review your cart.',
      );
    if (cart.coupon && !cart.coupon.valid)
      throw new AppException(
        HttpStatus.CONFLICT,
        'COUPON_INVALID',
        cart.coupon.message ?? 'Your coupon no longer applies. Remove it to continue.',
      );

    const priced = await this.priced(snapshot, input);
    if (!priced.deliveryAvailable)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'DELIVERY_UNAVAILABLE',
        'This delivery option isn’t available.',
      );
    if (!priced.paymentAvailable)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PAYMENT_METHOD_UNAVAILABLE',
        priced.paymentOptions.find((p) => p.method === input.paymentMethod)?.reason ??
          'This payment method isn’t available.',
      );
    const total = priced.totals.total;
    if (total !== input.expectedTotal)
      throw new AppException(
        HttpStatus.CONFLICT,
        'PRICE_CHANGED',
        'Prices or availability changed since you started checking out. Please review your order.',
      );

    const { contact, name } = await this.contactFor(owner, input);
    const shipping = await this.shippingAddress(owner, input);
    const billing = input.billingSameAsShipping
      ? shipping
      : toAddress({ ...input.billingAddress!, country: 'IN' });

    // Order number first: the gateway order can be created before the transaction, so
    // a slow gateway never holds stock locks. An unused gateway order is harmless.
    const [{ nextval }] = await this.prisma.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('order_number_seq')`;
    const orderNumber = formatOrderNumber(nextval);
    const commerce = await this.settings.get('commerce');
    const prepaid = input.paymentMethod === 'PREPAID';
    const gatewayOrder = prepaid
      ? await this.payments.createGatewayOrder(orderNumber, total)
      : null;

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: cart.items.map((i) => i.variantId) } },
      select: { id: true, sku: true, product: { select: { hsnCode: true } } },
    });
    const variantInfo = new Map(variants.map((v) => [v.id, v]));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + commerce.stockReservationMinutes * 60_000);

    const order = await this.prisma.$transaction(
      async (tx) => {
        const created = await tx.order.create({
          data: {
            orderNumber,
            idempotencyKey: input.idempotencyKey,
            userId: owner.userId,
            email: contact.email,
            phone: contact.phone,
            status: prepaid ? 'PAYMENT_PENDING' : 'CONFIRMED',
            paymentMethod: input.paymentMethod,
            deliveryMethod: input.deliveryMethod,
            shippingAddress: shipping as unknown as Prisma.InputJsonValue,
            billingAddress: billing as unknown as Prisma.InputJsonValue,
            mrpTotal: priced.totals.mrpTotal,
            subtotal: priced.totals.subtotal,
            couponDiscount: priced.totals.couponDiscount,
            shippingFee: priced.totals.shippingFee,
            codFee: priced.totals.codFee,
            taxTotal: priced.totals.taxIncluded,
            grandTotal: total,
            couponId: snapshot.couponId,
            couponCode: snapshot.couponId ? cart.coupon!.code : null,
            notes: input.notes,
            guestAccessTokenHash: guestToken
              ? hashGuestToken(this.env.SESSION_SECRET, guestToken)
              : null,
            reservationExpiresAt: prepaid ? expiresAt : null,
            confirmedAt: prepaid ? null : now,
            items: {
              create: cart.items.map((l) => {
                const share = snapshot.perLine.get(l.id) ?? { discount: 0, tax: 0 };
                return {
                  productId: l.productId,
                  variantId: l.variantId,
                  productName: l.name,
                  productSlug: l.slug,
                  variantName: l.variantName ?? '',
                  sku: variantInfo.get(l.variantId)?.sku ?? '',
                  imageUrl: l.image?.url ?? null,
                  hsnCode: variantInfo.get(l.variantId)?.product.hsnCode ?? null,
                  mrp: l.mrp,
                  unitPrice: l.price,
                  quantity: l.quantity,
                  taxRate: snapshot.taxRates.get(l.id) ?? 0,
                  taxAmount: share.tax,
                  discountAmount: share.discount,
                  lineTotal: l.lineTotal,
                };
              }),
            },
            history: {
              create: [
                { toStatus: 'PENDING', note: 'Order placed' },
                prepaid
                  ? {
                      fromStatus: 'PENDING',
                      toStatus: 'PAYMENT_PENDING',
                      note: 'Awaiting online payment',
                    }
                  : { fromStatus: 'PENDING', toStatus: 'CONFIRMED', note: 'Cash on delivery' },
              ],
            },
          },
        });

        for (const l of cart.items) {
          if (!(await reserve(tx, l.variantId, l.quantity, created.id)))
            throw new AppException(
              HttpStatus.CONFLICT,
              'INSUFFICIENT_STOCK',
              `Sorry, ${l.name} just sold out or has fewer units left. Please review your cart.`,
            );
          // Cash on delivery is confirmed straight away: the units are sold.
          if (!prepaid)
            await sell(
              tx,
              { variantId: l.variantId, productId: l.productId, quantity: l.quantity },
              created.id,
            );
        }

        if (snapshot.couponId) await this.claimCoupon(tx, snapshot.couponId, created, owner.userId);

        if (gatewayOrder)
          await tx.payment.create({
            data: {
              orderId: created.id,
              provider: this.payments.provider,
              providerOrderId: gatewayOrder.providerOrderId,
              amount: total,
            },
          });
        if (cart.id) await this.carts.clearPurchased(cart.id, tx);
        return created;
      },
      { timeout: 15_000 },
    );

    if (!prepaid) void this.payments.sendConfirmation(order.id);
    this.logger.log(`Order ${orderNumber} placed (${input.paymentMethod}, ${total} paise)`);
    return {
      orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      total,
      payment: gatewayOrder
        ? this.payments.session(order, gatewayOrder.providerOrderId, name)
        : null,
      guestAccessToken: guestToken,
    };
  }

  private async replay(
    existing: Order & { payments: Payment[] },
    owner: CartOwner,
    guestToken: string | null,
  ) {
    const sameOwner = owner.userId
      ? existing.userId === owner.userId
      : existing.guestAccessTokenHash === hashGuestToken(this.env.SESSION_SECRET, guestToken!);
    if (!sameOwner)
      throw new AppException(
        HttpStatus.CONFLICT,
        'IDEMPOTENCY_CONFLICT',
        'This request was already used. Please try again.',
      );
    const pending = existing.payments.find((p) => p.status === 'CREATED' && p.providerOrderId);
    const name = (existing.shippingAddress as { name?: string }).name ?? '';
    return {
      orderNumber: existing.orderNumber,
      status: existing.status,
      paymentMethod: existing.paymentMethod,
      total: existing.grandTotal,
      payment:
        existing.status === 'PAYMENT_PENDING' && pending
          ? this.payments.session(existing, pending.providerOrderId!, name)
          : null,
      guestAccessToken: guestToken,
    };
  }

  /**
   * Counts the coupon's use atomically: the conditional UPDATE can't exceed the usage
   * limit even under concurrent checkouts, and per-customer limits include guest
   * orders placed with the same email.
   */
  private async claimCoupon(
    tx: Prisma.TransactionClient,
    couponId: string,
    order: Order,
    userId: string | null,
  ) {
    const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: couponId } });
    const used = await tx.couponUsage.count({
      where: { couponId, OR: [{ email: order.email }, ...(userId ? [{ userId }] : [])] },
    });
    if (used >= coupon.usagePerUser)
      throw new AppException(
        HttpStatus.CONFLICT,
        'COUPON_INVALID',
        'You’ve already used this coupon.',
      );
    const claimed = await tx.$executeRaw`
      UPDATE "coupons" SET "used_count" = "used_count" + 1, "updated_at" = now()
      WHERE "id" = ${couponId} AND "is_active"
        AND ("usage_limit" IS NULL OR "used_count" < "usage_limit")`;
    if (!claimed)
      throw new AppException(
        HttpStatus.CONFLICT,
        'COUPON_INVALID',
        'This coupon has reached its usage limit.',
      );
    await tx.couponUsage.create({
      data: {
        couponId,
        userId,
        orderId: order.id,
        email: order.email,
        discount: order.couponDiscount,
      },
    });
  }

  private async contactFor(owner: CartOwner, input: PlaceOrderInput) {
    if (!owner.userId) {
      if (!input.contact)
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'CONTACT_REQUIRED',
          'Enter your email and mobile number.',
          [{ path: 'contact', message: 'Enter your email and mobile number' }],
        );
      return { contact: input.contact, name: input.shippingAddress?.name ?? '' };
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: owner.userId } });
    const email = input.contact?.email ?? user.email;
    const phone = input.contact?.phone ?? user.phone ?? input.shippingAddress?.phone;
    if (!email || !phone)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTACT_REQUIRED',
        'Add an email address so we can send your order updates.',
        [{ path: 'contact', message: 'Enter your email and mobile number' }],
      );
    return { contact: { email, phone }, name: user.name };
  }

  private async shippingAddress(
    owner: CartOwner,
    input: PlaceOrderInput,
  ): Promise<OrderAddressDto> {
    if (input.shippingAddressId) {
      const saved = owner.userId
        ? await this.prisma.address.findFirst({
            where: { id: input.shippingAddressId, userId: owner.userId },
          })
        : null;
      if (!saved)
        throw new AppException(
          HttpStatus.NOT_FOUND,
          'ADDRESS_NOT_FOUND',
          'That address is no longer in your address book.',
        );
      return toAddress(saved as unknown as Record<string, unknown>);
    }
    const typed = toAddress({ ...input.shippingAddress!, country: 'IN' });
    if (owner.userId && input.saveAddress) {
      const count = await this.prisma.address.count({ where: { userId: owner.userId } });
      if (count < ADDRESS_LIMIT)
        await this.prisma.address.create({
          data: { ...input.shippingAddress!, userId: owner.userId, isDefault: count === 0 },
        });
    }
    return typed;
  }

  // ------------------------------------------------------------------ order view

  /** The order if this caller may see it: its customer, or the guest holding its token. */
  async findAccessible(orderNumber: string, access: OrderAccess): Promise<OrderWithLines> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: { items: { orderBy: { id: 'asc' } }, payments: { orderBy: { createdAt: 'desc' } } },
    });
    const allowed =
      order &&
      ((access.userId && order.userId === access.userId) ||
        (access.guestToken &&
          order.guestAccessTokenHash ===
            hashGuestToken(this.env.SESSION_SECRET, access.guestToken)));
    // Same answer for "doesn't exist" and "not yours": order numbers are guessable.
    if (!allowed)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'We couldn’t find this order.');
    return order;
  }

  async summary(orderNumber: string, access: OrderAccess): Promise<OrderSummaryDto> {
    return toOrderSummary(await this.findAccessible(orderNumber, access));
  }
}

export function toOrderSummary(order: OrderWithLines): OrderSummaryDto {
  const latest = order.payments[0] ?? null;
  const pending = order.status === 'PAYMENT_PENDING';
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: latest?.status ?? null,
    deliveryMethod: order.deliveryMethod,
    placedAt: order.placedAt.toISOString(),
    reservationExpiresAt: pending ? (order.reservationExpiresAt?.toISOString() ?? null) : null,
    email: order.email,
    phone: order.phone,
    shippingAddress: toAddress(order.shippingAddress as Record<string, unknown>),
    items: order.items.map((i) => ({
      name: i.productName,
      slug: i.productSlug,
      variantName: i.variantName,
      sku: i.sku,
      imageUrl: i.imageUrl,
      quantity: i.quantity,
      mrp: i.mrp,
      unitPrice: i.unitPrice,
      discount: i.discountAmount,
      lineTotal: i.lineTotal,
    })),
    couponCode: order.couponCode,
    totals: {
      mrpTotal: order.mrpTotal,
      subtotal: order.subtotal,
      couponDiscount: order.couponDiscount,
      shippingFee: order.shippingFee,
      codFee: order.codFee,
      taxTotal: order.taxTotal,
      grandTotal: order.grandTotal,
    },
    canRetryPayment:
      pending && Boolean(order.reservationExpiresAt && order.reservationExpiresAt > new Date()),
  };
}
