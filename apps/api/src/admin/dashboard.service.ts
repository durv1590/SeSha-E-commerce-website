import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ORDER_STATUS_LABELS, type DashboardDto, type KpiDto } from '@seshakart/types';
import { PrismaService } from '../database/prisma.service';

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

/** Start of the India-time day containing `d`, as a UTC instant. */
export function istDayStart(d: Date): Date {
  const shifted = new Date(d.getTime() + IST_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_MS);
}

/** An order counts as a sale once confirmed (paid or COD), unless cancelled. */
const SOLD = Prisma.sql`o."confirmed_at" IS NOT NULL AND o."status" <> 'CANCELLED'`;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async totals(from: Date, to: Date) {
    const [row] = await this.prisma.$queryRaw<{ revenue: bigint | null; orders: bigint }[]>`
      SELECT sum(o."grand_total") AS revenue, count(*) AS orders
      FROM "orders" o WHERE ${SOLD} AND o."placed_at" >= ${from} AND o."placed_at" < ${to}`;
    const revenue = Number(row?.revenue ?? 0);
    const orders = Number(row?.orders ?? 0);
    return { revenue, orders, averageOrderValue: orders ? Math.round(revenue / orders) : 0 };
  }

  private async kpi(from: Date, to: Date): Promise<KpiDto> {
    const span = to.getTime() - from.getTime();
    const [current, previous] = await Promise.all([
      this.totals(from, to),
      this.totals(new Date(from.getTime() - span), from),
    ]);
    return { ...current, previous };
  }

  async get(now = new Date()): Promise<DashboardDto> {
    const today = istDayStart(now);
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const since30 = new Date(today.getTime() - 29 * DAY_MS);

    const [day, week, month, dailyRows, queues, recent, top] = await Promise.all([
      this.kpi(today, tomorrow),
      this.kpi(new Date(today.getTime() - 6 * DAY_MS), tomorrow),
      this.kpi(since30, tomorrow),
      this.prisma.$queryRaw<{ d: string; revenue: bigint; orders: bigint }[]>`
        SELECT to_char((o."placed_at" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS d,
               sum(o."grand_total") AS revenue, count(*) AS orders
        FROM "orders" o WHERE ${SOLD} AND o."placed_at" >= ${since30} AND o."placed_at" < ${tomorrow}
        GROUP BY 1`,
      this.queues(),
      this.prisma.order.findMany({
        orderBy: { placedAt: 'desc' },
        take: 8,
        select: {
          orderNumber: true,
          grandTotal: true,
          status: true,
          placedAt: true,
          shippingAddress: true,
        },
      }),
      this.prisma.$queryRaw<
        { product_id: string | null; name: string; units: bigint; revenue: bigint }[]
      >`
        SELECT oi."product_id", max(oi."product_name") AS name, sum(oi."quantity") AS units,
               sum(oi."line_total" - oi."discount_amount") AS revenue
        FROM "order_items" oi JOIN "orders" o ON o."id" = oi."order_id"
        WHERE ${SOLD} AND o."placed_at" >= ${since30}
        -- Lines whose product was since deleted have no id: group those by name.
        GROUP BY COALESCE(oi."product_id", 'name:' || oi."product_name"), oi."product_id"
        ORDER BY revenue DESC, name LIMIT 5`,
    ]);

    const byDay = new Map(dailyRows.map((r) => [r.d, r]));
    const daily = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(since30.getTime() + i * DAY_MS + IST_MS).toISOString().slice(0, 10);
      const r = byDay.get(date);
      return { date, revenue: Number(r?.revenue ?? 0), orders: Number(r?.orders ?? 0) };
    });

    return {
      generatedAt: now.toISOString(),
      today: day,
      last7Days: week,
      last30Days: month,
      daily,
      queues,
      recentOrders: recent.map((o) => ({
        orderNumber: o.orderNumber,
        customer: (o.shippingAddress as { name?: string }).name ?? '',
        total: o.grandTotal,
        status: o.status,
        statusLabel: ORDER_STATUS_LABELS[o.status],
        placedAt: o.placedAt.toISOString(),
      })),
      topProducts: top.map((t) => ({
        productId: t.product_id,
        name: t.name,
        units: Number(t.units),
        revenue: Number(t.revenue),
      })),
    };
  }

  async queues(): Promise<DashboardDto['queues']> {
    const [toShip, paymentPending, openReturns, stock, pendingReviews, pendingManualRefunds] =
      await Promise.all([
        this.prisma.order.count({
          where: { status: { in: ['CONFIRMED', 'PROCESSING', 'PACKED'] } },
        }),
        this.prisma.order.count({ where: { status: 'PAYMENT_PENDING' } }),
        this.prisma.returnRequest.count({
          where: { status: { in: ['REQUESTED', 'APPROVED', 'RECEIVED'] } },
        }),
        this.prisma.$queryRaw<{ low: bigint; out: bigint }[]>`
        SELECT count(*) FILTER (WHERE i."stock" - i."reserved" > 0 AND i."stock" - i."reserved" <= i."low_stock_threshold") AS low,
               count(*) FILTER (WHERE i."stock" - i."reserved" <= 0) AS out
        FROM "inventory" i
        JOIN "product_variants" v ON v."id" = i."variant_id" AND v."is_active"
        JOIN "products" p ON p."id" = v."product_id" AND p."status" = 'ACTIVE'`,
        this.prisma.review.count({ where: { status: 'PENDING' } }),
        this.prisma.refund.count({ where: { status: 'PENDING', payment: { provider: 'cod' } } }),
      ]);
    return {
      toShip,
      paymentPending,
      openReturns,
      lowStock: Number(stock[0]?.low ?? 0),
      outOfStock: Number(stock[0]?.out ?? 0),
      pendingReviews,
      pendingManualRefunds,
    };
  }
}
