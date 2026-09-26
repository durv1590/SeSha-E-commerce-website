import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InventoryLedgerEntryDto, InventoryRowDto, PaginationMeta } from '@seshakart/types';
import type { InventoryListQuery, StockAdjustmentInput } from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { RevalidationService } from '../../cache/revalidation.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../actor';

interface Row {
  variant_id: string;
  product_id: string;
  product_name: string;
  product_status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  variant_name: string;
  sku: string;
  image_url: string | null;
  is_active: boolean;
  stock: number;
  reserved: number;
  low_stock_threshold: number;
  updated_at: Date;
}

const stateOf = (available: number, threshold: number): InventoryRowDto['state'] =>
  available <= 0 ? 'out_of_stock' : available <= threshold ? 'low_stock' : 'in_stock';

/**
 * Stock per variant. Staff adjustments are single conditional UPDATEs (so they can
 * never take stock below what is reserved for open orders), each written to the
 * inventory ledger and the audit log in the same transaction.
 */
@Injectable()
export class InventoryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list(q: InventoryListQuery): Promise<{ data: InventoryRowDto[]; meta: PaginationMeta }> {
    const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      conds.push(
        Prisma.sql`(p."name" ILIKE ${like} OR v."sku" ILIKE ${like} OR v."name" ILIKE ${like})`,
      );
    }
    // Low/out filters match the dashboard counts: live products, active variants.
    if (q.stock !== 'all') conds.push(Prisma.sql`p."status" = 'ACTIVE' AND v."is_active"`);
    if (q.stock === 'low')
      conds.push(
        Prisma.sql`i."stock" - i."reserved" > 0 AND i."stock" - i."reserved" <= i."low_stock_threshold"`,
      );
    if (q.stock === 'out') conds.push(Prisma.sql`i."stock" - i."reserved" <= 0`);
    const where = Prisma.join(conds, ' AND ');
    const from = Prisma.sql`
      FROM "inventory" i
      JOIN "product_variants" v ON v."id" = i."variant_id"
      JOIN "products" p ON p."id" = v."product_id"`;

    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n ${from} WHERE ${where}`,
      this.prisma.$queryRaw<Row[]>`
        SELECT v."id" AS variant_id, p."id" AS product_id, p."name" AS product_name,
               p."status"::text AS product_status, v."name" AS variant_name, v."sku", v."is_active",
               i."stock", i."reserved", i."low_stock_threshold", i."updated_at",
               (SELECT pi."url" FROM "product_images" pi WHERE pi."product_id" = p."id"
                ORDER BY (pi."variant_id" = v."id") DESC NULLS LAST, pi."position" LIMIT 1) AS image_url
        ${from} WHERE ${where}
        ORDER BY (i."stock" - i."reserved") ASC, p."name" ASC, v."position" ASC
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    ]);
    const total = Number(countRows[0]?.n ?? 0);
    return {
      data: rows.map((r) => {
        const available = r.stock - r.reserved;
        return {
          variantId: r.variant_id,
          productId: r.product_id,
          productName: r.product_name,
          productStatus: r.product_status,
          variantName: r.variant_name,
          sku: r.sku,
          imageUrl: r.image_url,
          isActive: r.is_active,
          stock: r.stock,
          reserved: r.reserved,
          available,
          lowStockThreshold: r.low_stock_threshold,
          state: stateOf(available, r.low_stock_threshold),
          updatedAt: r.updated_at.toISOString(),
        };
      }),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  async adjust(
    variantId: string,
    input: StockAdjustmentInput,
    actor: Actor,
  ): Promise<{ stock: number; reserved: number; available: number }> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true, product: { select: { status: true, sku: true } } },
    });
    if (!variant?.inventory)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This variant doesn’t exist.');

    const result = await this.prisma.$transaction(async (tx) => {
      // Lock the row, then decide: stock may never drop below what is reserved for
      // open orders (the CHECK constraint enforces the same rule).
      const locked = await tx.$queryRaw<{ stock: number; reserved: number }[]>`
        SELECT "stock", "reserved" FROM "inventory" WHERE "variant_id" = ${variantId} FOR UPDATE`;
      const cur = locked[0]!;
      const target =
        input.mode === 'add'
          ? cur.stock + input.quantity
          : input.mode === 'remove'
            ? cur.stock - input.quantity
            : input.quantity;
      if (target < cur.reserved)
        throw new AppException(
          HttpStatus.CONFLICT,
          'BELOW_RESERVED',
          cur.reserved
            ? `${cur.reserved} unit${cur.reserved === 1 ? ' is' : 's are'} reserved for open orders, so stock can’t go below ${cur.reserved} (it’s ${cur.stock} now).`
            : `There ${cur.stock === 1 ? 'is' : 'are'} only ${cur.stock} in stock.`,
          [{ path: 'quantity', message: `Stock can’t go below ${cur.reserved}` }],
        );
      if (target > 10_000_000)
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'VALIDATION_FAILED',
          'That’s more stock than we can record.',
          [{ path: 'quantity', message: 'Enter a smaller quantity' }],
        );
      const rows = await tx.$queryRaw<{ stock: number; reserved: number }[]>`
        UPDATE "inventory" SET "stock" = ${target}, "updated_at" = now()
        WHERE "variant_id" = ${variantId} RETURNING "stock", "reserved"`;
      const before = cur.stock;
      const { stock, reserved } = rows[0]!;
      const delta = stock - before;
      if (delta !== 0)
        await tx.inventoryTransaction.create({
          data: {
            variantId,
            type: input.mode === 'add' ? 'RESTOCK' : 'ADJUSTMENT',
            quantity: delta,
            stockAfter: stock,
            reservedAfter: reserved,
            reason: input.reason,
            actorId: actor.userId,
          },
        });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'inventory.adjusted',
          entityType: 'product_variant',
          entityId: variantId,
          metadata: {
            sku: variant.sku,
            mode: input.mode,
            quantity: input.quantity,
            before,
            after: stock,
            reason: input.reason,
          },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return { stock, reserved, before };
    });
    // Shoppers see stock state ("Only 3 left", "Out of stock") on live products.
    if (variant.product.status === 'ACTIVE' && result.stock !== result.before)
      await this.revalidation.catalogChanged();
    return {
      stock: result.stock,
      reserved: result.reserved,
      available: result.stock - result.reserved,
    };
  }

  async setThreshold(variantId: string, lowStockThreshold: number, actor: Actor): Promise<void> {
    const inv = await this.prisma.inventory.findUnique({ where: { variantId } });
    if (!inv)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This variant doesn’t exist.');
    await this.prisma.$transaction(async (tx) => {
      await tx.inventory.update({ where: { variantId }, data: { lowStockThreshold } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'inventory.threshold_changed',
          entityType: 'product_variant',
          entityId: variantId,
          metadata: { from: inv.lowStockThreshold, to: lowStockThreshold },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
  }

  async ledger(
    variantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: InventoryLedgerEntryDto[]; meta: PaginationMeta }> {
    const where = { variantId };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.inventoryTransaction.count({ where }),
      this.prisma.inventoryTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { order: { select: { orderNumber: true } } },
      }),
    ]);
    const actorIds = [...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : [])))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        })
      : [];
    const names = new Map(actors.map((a) => [a.id, a.name]));
    return {
      data: rows.map((r) => ({
        id: r.id,
        type: r.type,
        quantity: r.quantity,
        stockAfter: r.stockAfter,
        reservedAfter: r.reservedAfter,
        reason: r.reason,
        orderNumber: r.order?.orderNumber ?? null,
        actor: r.actorId ? (names.get(r.actorId) ?? 'Former staff member') : null,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }
}
