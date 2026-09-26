import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Order, OrderStatus, Prisma } from '@prisma/client';
import {
  ORDER_STATUS_LABELS,
  type OrderDetailDto,
  type OrderListItemDto,
  type ReturnRequestDto,
  type ShipmentDto,
  type TrackOrderDto,
} from '@seshakart/types';
import {
  CANCEL_REASONS,
  RETURN_REASONS,
  type CancelOrderInput,
  type CreateShipmentInput,
  type OrderListQuery,
  type ReturnActionInput,
  type ReturnRequestInput,
  type ShipmentEventInput,
  type TrackOrderInput,
} from '@seshakart/validation';
import { AuditService } from '../audit/audit.service';
import { CheckoutService } from '../checkout/checkout.service';
import { release, restock } from '../checkout/inventory';
import type { OrderAccess } from '../checkout/order-access';
import { PaymentsService } from '../checkout/payments.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { paginated, type Envelope } from '../common/http/envelope';
import { PrismaService } from '../database/prisma.service';
import { InvoiceService } from '../invoices/invoice.service';
import { MessagingService } from '../messaging/messaging.service';
import { orderUpdateEmail } from '../messaging/templates';
import { carrierName, SHIPMENT_STATUS_LABELS } from '../shipping/carriers';
import { SHIPPING_PROVIDER, type ShippingProvider } from '../shipping/providers/shipping-provider';
import { ShippingService } from '../shipping/shipping.service';
import {
  ACTIVE_STATUSES,
  canTransition,
  CUSTOMER_CANCELLABLE,
  STAFF_CANCELLABLE,
  timeline,
} from './order-status';

const fullInclude = {
  items: { orderBy: { id: 'asc' } },
  history: { orderBy: { createdAt: 'asc' } },
  shipments: { orderBy: { createdAt: 'asc' } },
  returns: { orderBy: { createdAt: 'asc' } },
  refunds: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.OrderInclude;
type FullOrder = Prisma.OrderGetPayload<{ include: typeof fullInclude }>;
type Tx = Prisma.TransactionClient;

interface Actor {
  userId: string | null;
  ip?: string;
  userAgent?: string;
}

interface ReturnItem {
  orderItemId: string;
  quantity: number;
  name?: string;
  variantName?: string;
}

const OPEN_RETURN = ['REQUESTED', 'APPROVED', 'RECEIVED'] as const;
const RETURN_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved: pickup being arranged',
  REJECTED: 'Not approved',
  RECEIVED: 'Item received',
  COMPLETED: 'Completed',
};
const REFUND_STATUS_LABELS = {
  PENDING: 'In progress',
  PROCESSED: 'Refunded',
  FAILED: 'Failed',
} as const;

const day = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/**
 * Order lifecycle after checkout: what customers see and can do (history, tracking,
 * cancellation, returns, invoices) and what staff do (fulfilment, tracking updates,
 * returns and refunds). Every status change is checked against the state machine,
 * runs with the order row locked, and staff actions are audit-logged.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentsService,
    private readonly invoices: InvoiceService,
    private readonly shipping: ShippingService,
    private readonly messaging: MessagingService,
    private readonly audit: AuditService,
    @Inject(SHIPPING_PROVIDER) private readonly provider: ShippingProvider,
  ) {}

  // ================================================================== customer

  async list(userId: string, q: OrderListQuery): Promise<Envelope<OrderListItemDto[]>> {
    const byFilter: Record<OrderListQuery['filter'], Prisma.OrderWhereInput> = {
      all: {},
      active: { status: { in: [...ACTIVE_STATUSES] } },
      delivered: { status: 'DELIVERED' },
      cancelled: { status: 'CANCELLED' },
      returns: { status: { in: ['RETURN_REQUESTED', 'RETURNED', 'REFUND_INITIATED', 'REFUNDED'] } },
    };
    const where: Prisma.OrderWhereInput = { userId, ...byFilter[q.filter] };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { items: { orderBy: { id: 'asc' } }, shipments: true },
      }),
    ]);
    const items = await Promise.all(
      rows.map(async (o): Promise<OrderListItemDto> => {
        let deliveryNote: string | null = null;
        if (o.status === 'DELIVERED' && o.deliveredAt)
          deliveryNote = `Delivered on ${day(o.deliveredAt)}`;
        else if (o.status === 'CANCELLED' && o.cancelledAt)
          deliveryNote = `Cancelled on ${day(o.cancelledAt)}`;
        else if (ACTIVE_STATUSES.includes(o.status) && o.status !== 'PAYMENT_PENDING') {
          const w = await this.estimate(o, o.shipments);
          if (w) deliveryNote = `Arriving by ${day(w.to)}`;
        }
        return {
          orderNumber: o.orderNumber,
          status: o.status,
          statusLabel: ORDER_STATUS_LABELS[o.status],
          placedAt: o.placedAt.toISOString(),
          total: o.grandTotal,
          itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
          images: o.items.slice(0, 4).map((i) => i.imageUrl),
          firstItemName: o.items[0]?.productName ?? '',
          deliveryNote,
        };
      }),
    );
    return paginated(items, total, q.page, q.pageSize);
  }

  private async load(orderNumber: string, access: OrderAccess): Promise<FullOrder> {
    const { id } = await this.checkout.findAccessible(orderNumber, access);
    return this.prisma.order.findUniqueOrThrow({ where: { id }, include: fullInclude });
  }

  async detail(orderNumber: string, access: OrderAccess): Promise<OrderDetailDto> {
    return this.toDetail(await this.load(orderNumber, access));
  }

  /** Expected delivery window while an order is on its way. */
  private async estimate(
    order: Order,
    shipments: { estimatedDelivery: Date | null; isReturn: boolean }[],
  ) {
    if (order.status === 'OUT_FOR_DELIVERY') {
      const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
      return { from: today, to: today };
    }
    const eta = shipments.find((s) => !s.isReturn && s.estimatedDelivery)?.estimatedDelivery;
    if (eta) {
      const d = eta.toISOString().slice(0, 10);
      return { from: d, to: d };
    }
    const pincode = (order.shippingAddress as { pincode?: string }).pincode ?? '';
    return this.shipping.window(pincode, order.deliveryMethod, order.confirmedAt ?? order.placedAt);
  }

  private returnable(
    order: FullOrder,
    products: Map<string, { isReturnable: boolean; returnWindowDays: number }>,
  ) {
    const requested = new Map<string, number>();
    for (const r of order.returns)
      if (r.status !== 'REJECTED')
        for (const i of r.items as unknown as ReturnItem[])
          requested.set(i.orderItemId, (requested.get(i.orderItemId) ?? 0) + i.quantity);
    const now = Date.now();
    const canReturnStatus = order.status === 'DELIVERED' || order.status === 'RETURN_REQUESTED';
    let deadline: Date | null = null;
    const perItem = new Map<string, number>();
    for (const item of order.items) {
      const p = item.productId ? products.get(item.productId) : undefined;
      if (!p?.isReturnable || !order.deliveredAt) {
        perItem.set(item.id, 0);
        continue;
      }
      const until = new Date(order.deliveredAt.getTime() + p.returnWindowDays * 86_400_000);
      if (!deadline || until > deadline) deadline = until;
      const left = item.quantity - (requested.get(item.id) ?? 0);
      perItem.set(item.id, canReturnStatus && until.getTime() > now ? Math.max(0, left) : 0);
    }
    return { perItem, deadline };
  }

  private shipmentDto(s: FullOrder['shipments'][number]): ShipmentDto {
    const events = (
      s.events as { status: string; location?: string | null; note?: string | null; at: string }[]
    ).map((e) => ({
      status: e.status,
      label: SHIPMENT_STATUS_LABELS[e.status] ?? e.status,
      location: e.location ?? null,
      note: e.note ?? null,
      at: e.at,
    }));
    return {
      carrier: s.carrier,
      carrierName: carrierName(s.carrier),
      trackingNumber: s.trackingNumber,
      trackingUrl: s.trackingUrl,
      status: s.status,
      isReturn: s.isReturn,
      estimatedDelivery: s.estimatedDelivery?.toISOString() ?? null,
      shippedAt: s.shippedAt?.toISOString() ?? null,
      deliveredAt: s.deliveredAt?.toISOString() ?? null,
      events: events.reverse(),
    };
  }

  async toDetail(order: FullOrder): Promise<OrderDetailDto> {
    const productIds = order.items
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id));
    const products = new Map(
      (
        await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, isReturnable: true, returnWindowDays: true },
        })
      ).map((p) => [p.id, p]),
    );
    const { perItem, deadline } = this.returnable(order, products);
    const itemById = new Map(order.items.map((i) => [i.id, i]));
    const onTheWay = ['CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(
      order.status,
    );
    const ship = order.shippingAddress as Record<string, string | null>;
    const addr = (a: Record<string, string | null>) => ({
      name: a.name ?? '',
      phone: a.phone ?? '',
      line1: a.line1 ?? '',
      line2: a.line2 ?? null,
      landmark: a.landmark ?? null,
      city: a.city ?? '',
      state: a.state ?? '',
      pincode: a.pincode ?? '',
      country: a.country ?? 'IN',
    });
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      paymentMethod: order.paymentMethod,
      paymentStatus: order.payments[0]?.status ?? null,
      deliveryMethod: order.deliveryMethod,
      placedAt: order.placedAt.toISOString(),
      email: order.email,
      phone: order.phone,
      shippingAddress: addr(ship),
      billingAddress: addr(order.billingAddress as Record<string, string | null>),
      items: order.items.map((i) => ({
        id: i.id,
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
        returnableQuantity: perItem.get(i.id) ?? 0,
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
      timeline: timeline(order.status, order.placedAt, order.history),
      estimatedDelivery: onTheWay ? await this.estimate(order, order.shipments) : null,
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      cancelReason: order.cancelReason,
      shipments: order.shipments.map((s) => this.shipmentDto(s)),
      returns: order.returns.map((r): ReturnRequestDto => ({
        id: r.id,
        type: r.type,
        status: r.status,
        statusLabel: RETURN_STATUS_LABELS[r.status] ?? r.status,
        reason: RETURN_REASONS[r.reason as keyof typeof RETURN_REASONS] ?? r.reason,
        comments: r.comments,
        resolutionNote: r.resolutionNote,
        items: (r.items as unknown as ReturnItem[]).map((i) => ({
          orderItemId: i.orderItemId,
          name: itemById.get(i.orderItemId)?.productName ?? i.name ?? '',
          variantName: itemById.get(i.orderItemId)?.variantName ?? i.variantName ?? '',
          quantity: i.quantity,
        })),
        createdAt: r.createdAt.toISOString(),
      })),
      refunds: order.refunds.map((r) => ({
        amount: r.amount,
        status: r.status,
        statusLabel: REFUND_STATUS_LABELS[r.status],
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
      })),
      invoice:
        order.invoiceNumber && order.invoiceDate
          ? { number: order.invoiceNumber, date: order.invoiceDate.toISOString() }
          : null,
      canCancel: CUSTOMER_CANCELLABLE.includes(order.status),
      returnDeadline: order.deliveredAt && deadline ? deadline.toISOString() : null,
      canRequestReturn: [...perItem.values()].some((q) => q > 0),
      canRetryPayment:
        order.status === 'PAYMENT_PENDING' &&
        Boolean(order.reservationExpiresAt && order.reservationExpiresAt > new Date()),
    };
  }

  async cancelByCustomer(
    orderNumber: string,
    access: OrderAccess,
    input: CancelOrderInput,
  ): Promise<OrderDetailDto> {
    const order = await this.load(orderNumber, access);
    if (!CUSTOMER_CANCELLABLE.includes(order.status))
      throw new AppException(
        HttpStatus.CONFLICT,
        'ORDER_NOT_CANCELLABLE',
        order.status === 'PACKED' || ACTIVE_STATUSES.includes(order.status)
          ? 'This order has already been packed or shipped. You can return it after delivery.'
          : 'This order can’t be cancelled.',
      );
    const reason = CANCEL_REASONS[input.reason] + (input.comments ? `: ${input.comments}` : '');
    await this.cancel(order.id, {
      reason,
      allowed: CUSTOMER_CANCELLABLE,
      actor: { userId: access.userId },
      byStaff: false,
    });
    return this.detail(orderNumber, access);
  }

  async requestReturn(
    orderNumber: string,
    access: OrderAccess,
    input: ReturnRequestInput,
  ): Promise<OrderDetailDto> {
    const order = await this.load(orderNumber, access);
    const detail = await this.toDetail(order);
    const byId = new Map(detail.items.map((i) => [i.id, i]));
    for (const it of input.items) {
      const line = byId.get(it.orderItemId);
      if (!line)
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'VALIDATION_FAILED',
          'Choose items from this order.',
        );
      if (line.returnableQuantity < it.quantity)
        throw new AppException(
          HttpStatus.CONFLICT,
          'NOT_RETURNABLE',
          line.returnableQuantity === 0
            ? `${line.name} can’t be returned or replaced (not returnable, already requested, or the return window has closed).`
            : `Only ${line.returnableQuantity} of ${line.name} can be returned.`,
        );
    }
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, order.id);
      if (locked.status !== 'DELIVERED' && locked.status !== 'RETURN_REQUESTED')
        throw new AppException(
          HttpStatus.CONFLICT,
          'NOT_RETURNABLE',
          'This order can’t be returned.',
        );
      await tx.returnRequest.create({
        data: {
          orderId: order.id,
          userId: access.userId,
          type: input.type,
          reason: input.reason,
          comments: input.comments,
          items: input.items.map((i) => ({
            ...i,
            name: byId.get(i.orderItemId)!.name,
            variantName: byId.get(i.orderItemId)!.variantName,
          })) as unknown as Prisma.InputJsonValue,
        },
      });
      if (locked.status === 'DELIVERED')
        await this.move(
          tx,
          locked,
          'RETURN_REQUESTED',
          `${input.type === 'RETURN' ? 'Return' : 'Replacement'} requested`,
          null,
        );
    });
    void this.notify(order, {
      subject: `We’ve received your ${input.type === 'RETURN' ? 'return' : 'replacement'} request`,
      headline: `Your ${input.type === 'RETURN' ? 'return' : 'replacement'} request for order ${order.orderNumber} has been received.`,
      paragraphs: ['We’ll review it within 1–2 business days and let you know about the pickup.'],
    });
    return this.detail(orderNumber, access);
  }

  /** Public tracking: order number plus the email or mobile used. Minimal details only. */
  async track(input: TrackOrderInput): Promise<TrackOrderDto> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: input.orderNumber },
      include: {
        items: true,
        history: { orderBy: { createdAt: 'asc' } },
        shipments: { orderBy: { createdAt: 'asc' } },
      },
    });
    const contact = input.contact.trim().toLowerCase();
    const matches =
      order &&
      (order.email.toLowerCase() === contact ||
        order.phone === contact.replace(/\D/g, '').slice(-10));
    if (!matches)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'We couldn’t find an order with these details. Check the order number and the email or mobile used.',
      );
    const onTheWay = ['CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'].includes(
      order.status,
    );
    return {
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status],
      placedAt: order.placedAt.toISOString(),
      itemCount: order.items.reduce((s, i) => s + i.quantity, 0),
      deliveryCity: (order.shippingAddress as { city?: string }).city ?? '',
      timeline: timeline(order.status, order.placedAt, order.history),
      estimatedDelivery: onTheWay ? await this.estimate(order, order.shipments) : null,
      shipments: order.shipments.map((s) => this.shipmentDto(s as FullOrder['shipments'][number])),
    };
  }

  async invoice(
    orderNumber: string,
    access: OrderAccess,
  ): Promise<{ filename: string; pdf: Buffer }> {
    const order = await this.load(orderNumber, access);
    if (!order.invoiceNumber)
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'INVOICE_NOT_READY',
        'The invoice is issued when your order ships.',
      );
    return {
      filename: `SeShaKart-invoice-${order.invoiceNumber.replace(/\//g, '-')}.pdf`,
      pdf: await this.invoices.pdf(order),
    };
  }

  // ================================================================== staff

  private async byNumber(orderNumber: string): Promise<FullOrder> {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: fullInclude,
    });
    if (!order) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Order not found.');
    return order;
  }

  async staffDetail(orderNumber: string): Promise<OrderDetailDto> {
    return this.toDetail(await this.byNumber(orderNumber));
  }

  private async lock(tx: Tx, orderId: string): Promise<Order> {
    await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;
    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  /** The one place order statuses change for fulfilment, cancellation and returns. */
  private async move(
    tx: Tx,
    order: Order,
    to: OrderStatus,
    note: string | null,
    actorId: string | null,
    data: Prisma.OrderUpdateInput = {},
  ) {
    if (!canTransition(order.status, to))
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATUS_CHANGE',
        `An order that is ${ORDER_STATUS_LABELS[order.status].toLowerCase()} can’t become ${ORDER_STATUS_LABELS[to].toLowerCase()}.`,
      );
    await tx.order.update({ where: { id: order.id }, data: { status: to, ...data } });
    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: to, note, actorId },
    });
  }

  private async record(
    actor: Actor,
    action: string,
    orderId: string,
    metadata: Prisma.InputJsonValue,
    tx?: Tx,
  ) {
    await this.audit.record(
      {
        actorId: actor.userId,
        action,
        entityType: 'order',
        entityId: orderId,
        metadata,
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
      tx,
    );
  }

  async setStatus(
    orderNumber: string,
    status: 'PROCESSING' | 'PACKED',
    note: string | undefined,
    actor: Actor,
  ) {
    const order = await this.byNumber(orderNumber);
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, order.id);
      await this.move(tx, locked, status, note ?? null, actor.userId);
      await this.record(
        actor,
        'order.status_changed',
        order.id,
        { from: locked.status, to: status, note: note ?? null },
        tx,
      );
    });
    return this.staffDetail(orderNumber);
  }

  /** Dispatch: records the shipment, issues the invoice, marks the order shipped. */
  async addShipment(orderNumber: string, input: CreateShipmentInput, actor: Actor) {
    const order = await this.byNumber(orderNumber);
    if (!['CONFIRMED', 'PROCESSING', 'PACKED'].includes(order.status))
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_STATUS_CHANGE',
        'Only confirmed orders that haven’t shipped can be dispatched.',
      );
    const duplicate = await this.prisma.shipment.findFirst({
      where: { carrier: input.carrier, trackingNumber: input.trackingNumber },
      include: { order: { select: { orderNumber: true } } },
    });
    if (duplicate)
      throw new AppException(
        HttpStatus.CONFLICT,
        'TRACKING_NUMBER_IN_USE',
        `This tracking number is already used for order ${duplicate.order.orderNumber}.`,
      );
    const a = order.shippingAddress as Record<string, string | null>;
    const created = await this.provider.createShipment(
      {
        orderNumber,
        address: {
          name: a.name ?? '',
          phone: a.phone ?? '',
          line1: a.line1 ?? '',
          line2: a.line2 ?? null,
          city: a.city ?? '',
          state: a.state ?? '',
          pincode: a.pincode ?? '',
        },
        paymentMethod: order.paymentMethod,
        codAmount: order.paymentMethod === 'COD' ? order.grandTotal : 0,
        items: order.items.map((i) => ({
          sku: i.sku,
          name: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        weightGrams: null,
      },
      {
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        trackingUrl: input.trackingUrl ?? null,
        estimatedDelivery: input.estimatedDelivery ?? null,
      },
    );
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, order.id);
      await tx.shipment.create({
        data: {
          orderId: order.id,
          carrier: created.carrier,
          trackingNumber: created.trackingNumber,
          trackingUrl: created.trackingUrl,
          providerShipmentId: created.providerShipmentId,
          estimatedDelivery: created.estimatedDelivery,
          status: 'IN_TRANSIT',
          shippedAt: now,
          events: [{ status: 'PICKED_UP', location: null, note: 'Shipped', at: now.toISOString() }],
        },
      });
      await this.move(
        tx,
        locked,
        'SHIPPED',
        `Shipped with ${carrierName(created.carrier)} (${created.trackingNumber})`,
        actor.userId,
        {
          shippedAt: now,
        },
      );
      await this.invoices.issue(tx, order.id, now);
      await this.record(
        actor,
        'order.shipped',
        order.id,
        { carrier: created.carrier, trackingNumber: created.trackingNumber },
        tx,
      );
    });
    void this.notify(order, {
      subject: `Your order ${orderNumber} has shipped`,
      headline: `Good news! Your order ${orderNumber} is on its way.`,
      paragraphs: [
        `Carrier: ${carrierName(created.carrier)} · Tracking number: ${created.trackingNumber}`,
        created.estimatedDelivery ? `Expected by ${day(created.estimatedDelivery)}.` : '',
      ].filter(Boolean),
      link: created.trackingUrl
        ? { label: 'Track your parcel', url: created.trackingUrl }
        : undefined,
    });
    return this.staffDetail(orderNumber);
  }

  /**
   * A tracking update (from staff now, from a courier integration later): moves the
   * order along, and on delivery records cash collected for COD orders. A parcel that
   * comes back to us (RTO) is restocked and, if prepaid, refunded.
   */
  async addShipmentEvent(orderNumber: string, input: ShipmentEventInput, actor: Actor) {
    const order = await this.byNumber(orderNumber);
    const shipment = [...order.shipments].reverse().find((s) => !s.isReturn);
    if (!shipment)
      throw new AppException(
        HttpStatus.CONFLICT,
        'NO_SHIPMENT',
        'This order hasn’t been shipped yet.',
      );
    const at = input.at ?? new Date();
    let refundAfter = false;
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, order.id);
      const events = [
        ...(shipment.events as Prisma.JsonArray),
        {
          status: input.status,
          location: input.location ?? null,
          note: input.note ?? null,
          at: at.toISOString(),
        },
      ];
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          events: events as Prisma.InputJsonValue,
          status: input.status,
          deliveredAt: input.status === 'DELIVERED' ? at : undefined,
        },
      });
      const note = [SHIPMENT_STATUS_LABELS[input.status], input.location, input.note]
        .filter(Boolean)
        .join(' · ');
      if (input.status === 'OUT_FOR_DELIVERY' && locked.status === 'SHIPPED')
        await this.move(tx, locked, 'OUT_FOR_DELIVERY', note, actor.userId);
      if (input.status === 'FAILED' && locked.status === 'OUT_FOR_DELIVERY')
        await this.move(tx, locked, 'SHIPPED', note, actor.userId);
      if (input.status === 'DELIVERED' && locked.status !== 'DELIVERED') {
        await this.move(tx, locked, 'DELIVERED', note, actor.userId, { deliveredAt: at });
        if (locked.paymentMethod === 'COD') await this.payments.recordCodCollected(tx, locked);
      }
      if (input.status === 'RETURNED' && locked.status !== 'RETURNED') {
        await this.move(
          tx,
          locked,
          'RETURNED',
          `Returned to seller: ${input.note ?? 'undeliverable'}`,
          actor.userId,
        );
        const items = await tx.orderItem.findMany({ where: { orderId: order.id } });
        for (const i of items)
          if (i.variantId)
            await restock(
              tx,
              { variantId: i.variantId, productId: i.productId, quantity: i.quantity },
              order.id,
              'RETURN',
              'Returned by courier',
            );
        refundAfter = locked.paymentMethod === 'PREPAID';
      }
      await this.record(
        actor,
        'order.tracking_updated',
        order.id,
        { status: input.status, location: input.location ?? null },
        tx,
      );
    });
    if (refundAfter)
      await this.payments.refund(order.id, {
        reason: 'Parcel could not be delivered',
        actorId: actor.userId,
      });
    const messages: Partial<
      Record<
        ShipmentEventInput['status'],
        { subject: string; headline: string; paragraphs: string[] }
      >
    > = {
      OUT_FOR_DELIVERY: {
        subject: `Your order ${orderNumber} is out for delivery`,
        headline: 'Your order is out for delivery today.',
        paragraphs: [
          order.paymentMethod === 'COD'
            ? `Please keep ₹${(order.grandTotal / 100).toLocaleString('en-IN')} ready (cash or UPI).`
            : 'Please keep your phone handy for the delivery partner.',
        ],
      },
      DELIVERED: {
        subject: `Your order ${orderNumber} was delivered`,
        headline: 'Your order has been delivered. We hope you love it!',
        paragraphs: [
          'If anything isn’t right, you can request a return or replacement from your order page.',
        ],
      },
    };
    const m = messages[input.status];
    if (m) void this.notify(order, m);
    return this.staffDetail(orderNumber);
  }

  async cancelByStaff(orderNumber: string, reason: string, actor: Actor) {
    const order = await this.byNumber(orderNumber);
    await this.cancel(order.id, { reason, allowed: STAFF_CANCELLABLE, actor, byStaff: true });
    return this.staffDetail(orderNumber);
  }

  /**
   * Cancels an order: held units are released, sold units restocked, the coupon use is
   * given back, and a captured online payment is refunded in full.
   */
  private async cancel(
    orderId: string,
    opts: { reason: string; allowed: readonly OrderStatus[]; actor: Actor; byStaff: boolean },
  ) {
    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, orderId);
      if (!opts.allowed.includes(locked.status))
        throw new AppException(
          HttpStatus.CONFLICT,
          'ORDER_NOT_CANCELLABLE',
          'This order can no longer be cancelled.',
        );
      const items = await tx.orderItem.findMany({ where: { orderId } });
      const reserved = locked.status === 'PENDING' || locked.status === 'PAYMENT_PENDING';
      for (const i of items) {
        if (!i.variantId) continue;
        if (reserved) await release(tx, i.variantId, i.quantity, orderId, 'Order cancelled');
        else
          await restock(
            tx,
            { variantId: i.variantId, productId: i.productId, quantity: i.quantity },
            orderId,
            'RESTOCK',
            'Order cancelled',
          );
      }
      if (locked.couponId) {
        await tx.$executeRaw`UPDATE "coupons" SET "used_count" = GREATEST("used_count" - 1, 0), "updated_at" = now() WHERE "id" = ${locked.couponId}`;
        await tx.couponUsage.deleteMany({ where: { orderId } });
      }
      await tx.payment.updateMany({
        where: { orderId, status: 'CREATED' },
        data: { status: 'FAILED', errorCode: 'ORDER_CANCELLED' },
      });
      await this.move(
        tx,
        locked,
        'CANCELLED',
        opts.reason,
        opts.byStaff ? opts.actor.userId : null,
        {
          cancelledAt: new Date(),
          cancelReason: opts.reason.slice(0, 300),
          reservationExpiresAt: null,
        },
      );
      await this.record(
        opts.actor,
        opts.byStaff ? 'order.cancelled_by_staff' : 'order.cancelled_by_customer',
        orderId,
        { reason: opts.reason },
        tx,
      );
      return locked;
    });
    const paid = await this.prisma.payment.count({
      where: { orderId, status: 'CAPTURED', provider: { not: 'cod' } },
    });
    if (paid)
      await this.payments
        .refund(orderId, { reason: 'Order cancelled', actorId: opts.actor.userId })
        .catch((err: unknown) =>
          this.logger.error(
            `Refund after cancelling ${order.orderNumber} failed: ${(err as Error).message}`,
          ),
        );
    void this.notify(order, {
      subject: `Order ${order.orderNumber} cancelled`,
      headline: `Your order ${order.orderNumber} has been cancelled.`,
      paragraphs: [
        paid
          ? 'Your payment is being refunded to the original payment method. Banks usually take 5–7 working days.'
          : 'No payment was taken for this order.',
      ],
    });
  }

  async actOnReturn(returnId: string, input: ReturnActionInput, actor: Actor) {
    const request = await this.prisma.returnRequest.findUnique({ where: { id: returnId } });
    if (!request)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Return request not found.');
    const next = {
      approve: 'APPROVED',
      reject: 'REJECTED',
      receive: 'RECEIVED',
      complete: 'COMPLETED',
    } as const;
    const allowedFrom: Record<ReturnActionInput['action'], string[]> = {
      approve: ['REQUESTED'],
      reject: ['REQUESTED', 'APPROVED'],
      receive: ['APPROVED'],
      complete: ['RECEIVED'],
    };
    if (!allowedFrom[input.action].includes(request.status))
      throw new AppException(
        HttpStatus.CONFLICT,
        'INVALID_RETURN_ACTION',
        `A ${request.status.toLowerCase()} request can’t be ${next[input.action].toLowerCase()}.`,
      );
    const items = request.items as unknown as ReturnItem[];
    let refundAmount = 0;
    const order = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lock(tx, request.orderId);
      const done = input.action === 'reject' || input.action === 'complete';
      await tx.returnRequest.update({
        where: { id: returnId },
        data: {
          status: next[input.action],
          resolutionNote: input.note ?? request.resolutionNote,
          resolvedAt: done ? new Date() : undefined,
        },
      });
      const orderItems = new Map(
        (await tx.orderItem.findMany({ where: { orderId: locked.id } })).map((i) => [i.id, i]),
      );
      if (input.action === 'receive' && request.type === 'RETURN' && input.restock)
        for (const it of items) {
          const oi = orderItems.get(it.orderItemId);
          if (oi?.variantId)
            await restock(
              tx,
              { variantId: oi.variantId, productId: oi.productId, quantity: it.quantity },
              locked.id,
              'RETURN',
              'Customer return',
            );
        }
      const open = await tx.returnRequest.count({
        where: { orderId: locked.id, id: { not: returnId }, status: { in: [...OPEN_RETURN] } },
      });
      if (input.action === 'complete' && request.type === 'RETURN') {
        // The customer gets back what they paid for the returned units (their share of any coupon excluded).
        refundAmount = items.reduce((s, it) => {
          const oi = orderItems.get(it.orderItemId);
          if (!oi) return s;
          return (
            s +
            oi.unitPrice * it.quantity -
            Math.round((oi.discountAmount * it.quantity) / oi.quantity)
          );
        }, 0);
        if (open === 0 && locked.status === 'RETURN_REQUESTED')
          await this.move(tx, locked, 'RETURNED', input.note ?? 'Return completed', actor.userId);
      }
      if (
        open === 0 &&
        locked.status === 'RETURN_REQUESTED' &&
        (input.action === 'reject' ||
          (input.action === 'complete' && request.type === 'REPLACEMENT'))
      )
        await this.move(
          tx,
          locked,
          'DELIVERED',
          input.action === 'reject' ? 'Return request not approved' : 'Replacement delivered',
          actor.userId,
        );
      await this.record(
        actor,
        `return.${input.action}`,
        locked.id,
        { returnId, note: input.note ?? null },
        tx,
      );
      return locked;
    });
    if (refundAmount > 0)
      await this.payments.refund(order.id, {
        amount: refundAmount,
        reason: 'Return completed',
        actorId: actor.userId,
      });
    const copy: Record<ReturnActionInput['action'], { subject: string; headline: string }> = {
      approve: {
        subject: 'Your return request is approved',
        headline: 'We’ve approved your request and will arrange a pickup.',
      },
      reject: {
        subject: 'Update on your return request',
        headline: 'We couldn’t approve your return request.',
      },
      receive: {
        subject: 'We’ve received your return',
        headline: 'Your returned item has reached us.',
      },
      complete: {
        subject:
          request.type === 'RETURN' ? 'Your return is complete' : 'Your replacement is complete',
        headline:
          request.type === 'RETURN'
            ? 'Your return is complete and your refund has been started.'
            : 'Your replacement has been completed.',
      },
    };
    void this.notify(order, { ...copy[input.action], paragraphs: input.note ? [input.note] : [] });
    return this.staffDetail(order.orderNumber);
  }

  async refund(orderNumber: string, input: { amount?: number; reason: string }, actor: Actor) {
    const order = await this.byNumber(orderNumber);
    await this.payments.refund(order.id, { ...input, actorId: actor.userId });
    await this.record(actor, 'order.refunded', order.id, {
      amount: input.amount ?? null,
      reason: input.reason,
    });
    return this.staffDetail(orderNumber);
  }

  async completeManualRefund(refundId: string, reference: string, actor: Actor) {
    await this.payments.completeManualRefund(refundId, reference, actor.userId);
    const refund = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { order: true },
    });
    await this.record(actor, 'refund.manual_completed', refund.orderId, { refundId, reference });
    return this.staffDetail(refund.order.orderNumber);
  }

  // ================================================================== notifications

  private async notify(
    order: Order,
    m: {
      subject: string;
      headline: string;
      paragraphs: string[];
      link?: { label: string; url: string };
    },
  ) {
    try {
      const name = (order.shippingAddress as { name?: string }).name ?? 'there';
      await this.messaging.sendEmail({
        to: order.email,
        ...orderUpdateEmail({
          name,
          orderNumber: order.orderNumber,
          orderUrl: this.payments.orderUrl(order),
          ...m,
        }),
      });
    } catch (err) {
      this.logger.warn(`Order email failed: ${(err as Error).message}`);
    }
  }
}
