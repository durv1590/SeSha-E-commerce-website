import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SalesReportDto, SalesReportRowDto } from '@seshakart/types';
import type { SalesReportQuery } from '@seshakart/validation';
import { PrismaService } from '../../database/prisma.service';
import { toCsv } from '../catalog/csv';

/** A sale = confirmed order that wasn't cancelled (same definition as the dashboard). */
const SOLD = Prisma.sql`o."confirmed_at" IS NOT NULL AND o."status" <> 'CANCELLED'`;
const IST = (col: Prisma.Sql) =>
  Prisma.sql`(${col} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')`;

interface Agg {
  period: string;
  orders: bigint;
  units: bigint;
  gross: bigint;
  discounts: bigint;
  shipping: bigint;
  tax: bigint;
  total: bigint;
}

/**
 * Sales reports by India-time day or month. Sales are counted on the day the order
 * was placed; refunds on the day they were processed, so a period's net sales match
 * what actually happened in it.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async sales(q: SalesReportQuery): Promise<SalesReportDto> {
    const from = new Date(`${q.from}T00:00:00+05:30`);
    const to = new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86_400_000);
    const fmt = q.groupBy === 'day' ? 'YYYY-MM-DD' : 'YYYY-MM';
    const [agg, refunds, byPayment, byCategory] = await Promise.all([
      this.prisma.$queryRaw<Agg[]>`
        SELECT to_char(${IST(Prisma.sql`o."placed_at"`)}, ${fmt}) AS period,
               count(*) AS orders,
               COALESCE(sum(u.units), 0) AS units,
               COALESCE(sum(o."subtotal"), 0) AS gross,
               COALESCE(sum(o."coupon_discount"), 0) AS discounts,
               COALESCE(sum(o."shipping_fee" + o."cod_fee"), 0) AS shipping,
               COALESCE(sum(o."tax_total"), 0) AS tax,
               COALESCE(sum(o."grand_total"), 0) AS total
        FROM "orders" o
        LEFT JOIN LATERAL (SELECT sum(oi."quantity") AS units FROM "order_items" oi WHERE oi."order_id" = o."id") u ON TRUE
        WHERE ${SOLD} AND o."placed_at" >= ${from} AND o."placed_at" < ${to}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ period: string; amount: bigint }[]>`
        SELECT to_char(${IST(Prisma.sql`r."processed_at"`)}, ${fmt}) AS period, sum(r."amount") AS amount
        FROM "refunds" r
        WHERE r."status" = 'PROCESSED' AND r."processed_at" >= ${from} AND r."processed_at" < ${to}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ method: 'PREPAID' | 'COD'; orders: bigint; total: bigint }[]>`
        SELECT o."payment_method"::text AS method, count(*) AS orders, COALESCE(sum(o."grand_total"), 0) AS total
        FROM "orders" o
        WHERE ${SOLD} AND o."placed_at" >= ${from} AND o."placed_at" < ${to}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ category: string; units: bigint; sales: bigint }[]>`
        SELECT COALESCE(c."name", 'Removed products') AS category,
               sum(oi."quantity") AS units, sum(oi."line_total") AS sales
        FROM "order_items" oi
        JOIN "orders" o ON o."id" = oi."order_id"
        LEFT JOIN "products" p ON p."id" = oi."product_id"
        LEFT JOIN "categories" c ON c."id" = p."category_id"
        WHERE ${SOLD} AND o."placed_at" >= ${from} AND o."placed_at" < ${to}
        GROUP BY 1 ORDER BY sales DESC LIMIT 20`,
    ]);

    // Every period in range appears, even with no sales.
    const periods: string[] = [];
    const cursor = new Date(`${q.from}T12:00:00+05:30`);
    const last = q.groupBy === 'day' ? q.to : q.to.slice(0, 7);
    for (let i = 0; i < 800; i++) {
      const iso = cursor.toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' });
      const key = q.groupBy === 'day' ? iso : iso.slice(0, 7);
      if (periods.at(-1) !== key) periods.push(key);
      if (key >= last) break;
      if (q.groupBy === 'day') cursor.setUTCDate(cursor.getUTCDate() + 1);
      else cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    }
    const byPeriod = new Map(agg.map((a) => [a.period, a]));
    const refundBy = new Map(refunds.map((r) => [r.period, Number(r.amount)]));
    const rows: SalesReportRowDto[] = periods.map((period) => {
      const a = byPeriod.get(period);
      const refundsAmt = refundBy.get(period) ?? 0;
      const total = Number(a?.total ?? 0);
      return {
        period,
        orders: Number(a?.orders ?? 0),
        units: Number(a?.units ?? 0),
        grossSales: Number(a?.gross ?? 0),
        discounts: Number(a?.discounts ?? 0),
        shipping: Number(a?.shipping ?? 0),
        tax: Number(a?.tax ?? 0),
        refunds: refundsAmt,
        netSales: total - refundsAmt,
      };
    });
    const sum = (k: keyof Omit<SalesReportRowDto, 'period'>) => rows.reduce((s, r) => s + r[k], 0);
    return {
      from: q.from,
      to: q.to,
      groupBy: q.groupBy,
      rows,
      totals: {
        orders: sum('orders'),
        units: sum('units'),
        grossSales: sum('grossSales'),
        discounts: sum('discounts'),
        shipping: sum('shipping'),
        tax: sum('tax'),
        refunds: sum('refunds'),
        netSales: sum('netSales'),
      },
      byPayment: byPayment.map((p) => ({
        method: p.method,
        orders: Number(p.orders),
        netSales: Number(p.total),
      })),
      byCategory: byCategory.map((c) => ({
        category: c.category,
        units: Number(c.units),
        sales: Number(c.sales),
      })),
    };
  }

  async salesCsv(q: SalesReportQuery): Promise<string> {
    const r = await this.sales(q);
    const rupees = (p: number) => (p / 100).toFixed(2);
    return toCsv([
      [
        'period',
        'orders',
        'units',
        'gross_sales',
        'discounts',
        'delivery_and_cod_fees',
        'gst_included',
        'refunds',
        'net_sales',
      ],
      ...[...r.rows, { period: 'Total', ...r.totals }].map((x) => [
        x.period,
        x.orders,
        x.units,
        rupees(x.grossSales),
        rupees(x.discounts),
        rupees(x.shipping),
        rupees(x.tax),
        rupees(x.refunds),
        rupees(x.netSales),
      ]),
    ]);
  }
}
