import { Injectable } from '@nestjs/common';
import { Prisma, type OrderStatus } from '@prisma/client';
import {
  ORDER_STATUS_LABELS,
  type AdminOrderDto,
  type AdminOrderListItemDto,
  type AdminReturnListItemDto,
  type PaginationMeta,
} from '@seshakart/types';
import type { AdminOrderListQuery, AdminReturnListQuery } from '@seshakart/validation';
import { PrismaService } from '../../database/prisma.service';
import { STAFF_CANCELLABLE, TRANSITIONS } from '../../orders/order-status';
import { OrdersService } from '../../orders/orders.service';
import { toCsv } from '../catalog/csv';

const TO_SHIP: OrderStatus[] = ['CONFIRMED', 'PROCESSING', 'PACKED'];
const OPEN_RETURNS = ['REQUESTED', 'APPROVED', 'RECEIVED'] as const;
const RETURN_LABELS: Record<AdminReturnListItemDto['status'], string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RECEIVED: 'Received',
  COMPLETED: 'Completed',
};
const EXPORT_LIMIT = 10_000;

const listSelect = {
  id: true,
  orderNumber: true,
  placedAt: true,
  email: true,
  phone: true,
  userId: true,
  status: true,
  paymentMethod: true,
  grandTotal: true,
  shippingAddress: true,
  items: { select: { quantity: true } },
  payments: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.OrderSelect;
type ListRow = Prisma.OrderGetPayload<{ select: typeof listSelect }>;

export function toListItem(o: ListRow): AdminOrderListItemDto {
  const a = (o.shippingAddress ?? {}) as Record<string, string | undefined>;
  return {
    orderNumber: o.orderNumber,
    placedAt: o.placedAt.toISOString(),
    customerName: a.name ?? '',
    email: o.email,
    phone: o.phone,
    userId: o.userId,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    total: o.grandTotal,
    status: o.status,
    statusLabel: ORDER_STATUS_LABELS[o.status],
    paymentMethod: o.paymentMethod,
    paymentStatus: o.payments[0]?.status ?? null,
    city: a.city ?? '',
  };
}

/** India-time day boundaries for date filters. */
const dayStart = (d: string) => new Date(`${d}T00:00:00+05:30`);
const nextDay = (d: string) => new Date(dayStart(d).getTime() + 86_400_000);

/** Staff order queues, search, CSV export and the extended order view. */
@Injectable()
export class OrdersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  selectForList() {
    return listSelect;
  }

  private async where(q: AdminOrderListQuery): Promise<Prisma.OrderWhereInput> {
    const and: Prisma.OrderWhereInput[] = [];
    switch (q.status) {
      case 'all':
        break;
      case 'to_ship':
        and.push({ status: { in: TO_SHIP } });
        break;
      case 'returns':
        and.push({ returns: { some: { status: { in: [...OPEN_RETURNS] } } } });
        break;
      case 'refund_pending':
        and.push({ refunds: { some: { status: 'PENDING', payment: { provider: 'cod' } } } });
        break;
      default:
        and.push({ status: q.status });
    }
    if (q.payment !== 'all') and.push({ paymentMethod: q.payment });
    if (q.from) and.push({ placedAt: { gte: dayStart(q.from) } });
    if (q.to) and.push({ placedAt: { lt: nextDay(q.to) } });
    if (q.q) {
      const term = q.q.trim();
      const digits = term.replace(/\D/g, '');
      const or: Prisma.OrderWhereInput[] = [
        { orderNumber: { contains: term.toUpperCase() } },
        { email: { contains: term.toLowerCase() } },
      ];
      if (digits.length >= 4) or.push({ phone: { contains: digits.slice(-10) } });
      // Customer name lives in the address snapshot (JSON): match it case-insensitively.
      const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const byName = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "orders" WHERE "shipping_address"->>'name' ILIKE ${like} LIMIT 500`;
      if (byName.length) or.push({ id: { in: byName.map((r) => r.id) } });
      and.push({ OR: or });
    }
    return { AND: and };
  }

  async list(
    q: AdminOrderListQuery,
  ): Promise<{ data: AdminOrderListItemDto[]; meta: PaginationMeta }> {
    const where = await this.where(q);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        select: listSelect,
        orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      data: rows.map(toListItem),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  /** Orders matching the filters as CSV (most recent first, capped). */
  async export(q: AdminOrderListQuery): Promise<string> {
    const rows = await this.prisma.order.findMany({
      where: await this.where(q),
      orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
      take: EXPORT_LIMIT,
      select: {
        ...listSelect,
        subtotal: true,
        couponCode: true,
        couponDiscount: true,
        shippingFee: true,
        codFee: true,
        taxTotal: true,
        invoiceNumber: true,
      },
    });
    const rupees = (p: number) => (p / 100).toFixed(2);
    return toCsv([
      [
        'order_number',
        'placed_at',
        'status',
        'customer',
        'email',
        'phone',
        'city',
        'state',
        'pincode',
        'payment_method',
        'items',
        'subtotal',
        'coupon',
        'coupon_discount',
        'shipping_fee',
        'cod_fee',
        'gst_included',
        'total',
        'invoice_number',
      ],
      ...rows.map((o) => {
        const a = (o.shippingAddress ?? {}) as Record<string, string | undefined>;
        return [
          o.orderNumber,
          o.placedAt.toISOString(),
          ORDER_STATUS_LABELS[o.status],
          a.name ?? '',
          o.email,
          o.phone,
          a.city ?? '',
          a.state ?? '',
          a.pincode ?? '',
          o.paymentMethod,
          o.items.reduce((s, i) => s + i.quantity, 0),
          rupees(o.subtotal),
          o.couponCode ?? '',
          rupees(o.couponDiscount),
          rupees(o.shippingFee),
          rupees(o.codFee),
          rupees(o.taxTotal),
          rupees(o.grandTotal),
          o.invoiceNumber ?? '',
        ];
      }),
    ]);
  }

  async detail(orderNumber: string): Promise<AdminOrderDto> {
    const base = await this.orders.staffDetail(orderNumber);
    const o = await this.prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: {
        payments: { orderBy: { createdAt: 'asc' }, include: { refunds: true } },
        refunds: {
          orderBy: { createdAt: 'asc' },
          include: { payment: { select: { provider: true } } },
        },
        history: { orderBy: { createdAt: 'asc' } },
        shipments: { select: { isReturn: true } },
        user: {
          select: { id: true, name: true, status: true, _count: { select: { orders: true } } },
        },
      },
    });
    const actorIds = [
      ...new Set(
        [...o.history.map((h) => h.actorId), ...o.refunds.map((r) => r.actorId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    ];
    const actors = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
    const captured = [...o.payments]
      .reverse()
      .find((p) => p.status === 'CAPTURED' || p.status === 'PARTIALLY_REFUNDED');
    const refunded = captured
      ? captured.refunds.filter((r) => r.status !== 'FAILED').reduce((s, r) => s + r.amount, 0)
      : 0;
    const refundable =
      captured && (captured.provider === 'cod' || captured.providerPaymentId)
        ? Math.max(0, captured.amount - refunded)
        : 0;

    return {
      ...base,
      userId: o.userId,
      customer: o.user
        ? {
            id: o.user.id,
            name: o.user.name,
            orderCount: o.user._count.orders,
            status: o.user.status,
          }
        : null,
      notes: o.notes,
      payments: o.payments.map((p) => ({
        provider: p.provider,
        method: p.method,
        status: p.status,
        amount: p.amount,
        reference: p.providerPaymentId,
        error: p.errorDescription,
        createdAt: p.createdAt.toISOString(),
        capturedAt: p.capturedAt?.toISOString() ?? null,
      })),
      staffRefunds: o.refunds.map((r) => ({
        id: r.id,
        amount: r.amount,
        status: r.status,
        manual: r.payment.provider === 'cod',
        reason: r.reason,
        reference: r.reference ?? r.providerRefundId,
        actor: r.actorId ? (actors.get(r.actorId) ?? 'Former staff member') : null,
        createdAt: r.createdAt.toISOString(),
        processedAt: r.processedAt?.toISOString() ?? null,
      })),
      history: o.history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        toLabel: ORDER_STATUS_LABELS[h.toStatus],
        note: h.note,
        actor: h.actorId ? (actors.get(h.actorId) ?? 'Former staff member') : null,
        at: h.createdAt.toISOString(),
      })),
      actions: {
        statuses: (['PROCESSING', 'PACKED'] as const).filter((s) =>
          TRANSITIONS[o.status].includes(s),
        ),
        canShip: TO_SHIP.includes(o.status),
        canAddTrackingEvent:
          (o.status === 'SHIPPED' || o.status === 'OUT_FOR_DELIVERY') &&
          o.shipments.some((s) => !s.isReturn),
        canCancel: STAFF_CANCELLABLE.includes(o.status),
        refundable,
        refundIsManual: captured?.provider === 'cod',
      },
    };
  }

  invoice(orderNumber: string) {
    return this.orders.staffInvoice(orderNumber);
  }

  async returns(
    q: AdminReturnListQuery,
  ): Promise<{ data: AdminReturnListItemDto[]; meta: PaginationMeta }> {
    const where: Prisma.ReturnRequestWhereInput =
      q.status === 'all'
        ? {}
        : q.status === 'open'
          ? { status: { in: [...OPEN_RETURNS] } }
          : { status: q.status };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.findMany({
        where,
        // Oldest open requests first: they have waited longest.
        orderBy: q.status === 'open' ? [{ createdAt: 'asc' }] : [{ createdAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { order: { select: { orderNumber: true, shippingAddress: true } } },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        orderNumber: r.order.orderNumber,
        type: r.type,
        status: r.status,
        statusLabel: RETURN_LABELS[r.status],
        reason: r.reason,
        units: ((r.items as { quantity?: number }[] | null) ?? []).reduce(
          (s, i) => s + (i.quantity ?? 0),
          0,
        ),
        customerName:
          ((r.order.shippingAddress ?? {}) as Record<string, string | undefined>).name ?? '',
        createdAt: r.createdAt.toISOString(),
      })),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }
}
