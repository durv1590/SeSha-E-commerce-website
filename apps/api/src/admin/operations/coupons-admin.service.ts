import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Coupon } from '@prisma/client';
import type { AdminCouponDto, PaginationMeta } from '@seshakart/types';
import type { CouponInput, CouponListQuery } from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../actor';

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This coupon doesn’t exist.');

export function couponState(c: Coupon, now = new Date()): AdminCouponDto['state'] {
  if (!c.isActive) return 'inactive';
  if (c.endsAt && c.endsAt <= now) return 'expired';
  if (c.startsAt && c.startsAt > now) return 'scheduled';
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return 'exhausted';
  return 'live';
}

/** Coupon management. Checkout re-validates every rule when a coupon is applied or used. */
@Injectable()
export class CouponsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: CouponListQuery): Promise<{ data: AdminCouponDto[]; meta: PaginationMeta }> {
    const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (q.q)
      conds.push(
        Prisma.sql`"code" LIKE ${`%${q.q.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`,
      );
    const live = Prisma.sql`"is_active" AND ("starts_at" IS NULL OR "starts_at" <= now()) AND ("ends_at" IS NULL OR "ends_at" > now()) AND ("usage_limit" IS NULL OR "used_count" < "usage_limit")`;
    if (q.state === 'live') conds.push(live);
    if (q.state === 'scheduled') conds.push(Prisma.sql`"is_active" AND "starts_at" > now()`);
    if (q.state === 'expired') conds.push(Prisma.sql`"ends_at" <= now()`);
    if (q.state === 'inactive') conds.push(Prisma.sql`NOT "is_active"`);
    const where = Prisma.join(conds, ' AND ');
    const [count, ids] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "coupons" WHERE ${where}`,
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "coupons" WHERE ${where}
        ORDER BY "created_at" DESC, "id"
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    ]);
    const rows = await this.prisma.coupon.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const given = await this.discountGiven(rows.map((r) => r.id));
    const total = Number(count[0]?.n ?? 0);
    return {
      data: ids.map((r) => toDto(byId.get(r.id)!, given.get(r.id) ?? 0)),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  async get(id: string): Promise<AdminCouponDto> {
    const c = await this.prisma.coupon.findUnique({ where: { id } });
    if (!c) throw notFound();
    return toDto(c, (await this.discountGiven([id])).get(id) ?? 0);
  }

  async create(input: CouponInput, actor: Actor): Promise<AdminCouponDto> {
    await this.checkReferences(input);
    await this.assertCodeFree(input.code, null);
    const c = await this.prisma.$transaction(async (tx) => {
      const row = await tx.coupon.create({ data: fields(input) });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'coupon.created',
          entityType: 'coupon',
          entityId: row.id,
          metadata: { code: row.code, type: row.type, value: row.value },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return row;
    });
    return toDto(c, 0);
  }

  async update(id: string, input: CouponInput, actor: Actor): Promise<AdminCouponDto> {
    const current = await this.prisma.coupon.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (current.code !== input.code && current.usedCount > 0)
      throw new AppException(
        HttpStatus.CONFLICT,
        'COUPON_IN_USE',
        'This coupon has been used, so its code can’t change. Create a new coupon instead.',
        [{ path: 'code', message: 'Can’t change the code of a used coupon' }],
      );
    if (input.usageLimit !== null && input.usageLimit < current.usedCount)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        'The usage limit is below the number of times it has already been used.',
        [{ path: 'usageLimit', message: `It has already been used ${current.usedCount} times` }],
      );
    await this.checkReferences(input);
    await this.assertCodeFree(input.code, id);
    const c = await this.prisma.$transaction(async (tx) => {
      const row = await tx.coupon.update({ where: { id }, data: fields(input) });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'coupon.updated',
          entityType: 'coupon',
          entityId: id,
          metadata: {
            code: row.code,
            ...(current.isActive !== row.isActive ? { isActive: row.isActive } : {}),
          },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return row;
    });
    return toDto(c, (await this.discountGiven([id])).get(id) ?? 0);
  }

  /** Deletes a coupon that was never used; used ones are deactivated instead (history). */
  async remove(id: string, actor: Actor): Promise<void> {
    const c = await this.prisma.coupon.findUnique({
      where: { id },
      include: { _count: { select: { usages: true, orders: true } } },
    });
    if (!c) throw notFound();
    if (c.usedCount > 0 || c._count.usages > 0 || c._count.orders > 0)
      throw new AppException(
        HttpStatus.CONFLICT,
        'COUPON_IN_USE',
        'This coupon has been used, so it can’t be deleted. Deactivate it instead.',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.coupon.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'coupon.deleted',
          entityType: 'coupon',
          entityId: id,
          metadata: { code: c.code },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
  }

  private async assertCodeFree(code: string, exceptId: string | null) {
    const f = await this.prisma.coupon.findUnique({ where: { code }, select: { id: true } });
    if (f && f.id !== exceptId)
      throw new AppException(HttpStatus.CONFLICT, 'COUPON_EXISTS', 'This code is already used.', [
        { path: 'code', message: 'Another coupon uses this code' },
      ]);
  }

  private async checkReferences(input: CouponInput) {
    const errors: { path: string; message: string }[] = [];
    if (input.productIds.length) {
      const n = await this.prisma.product.count({ where: { id: { in: input.productIds } } });
      if (n !== new Set(input.productIds).size)
        errors.push({ path: 'productIds', message: 'Some of these products no longer exist' });
    }
    if (input.categoryIds.length) {
      const n = await this.prisma.category.count({ where: { id: { in: input.categoryIds } } });
      if (n !== new Set(input.categoryIds).size)
        errors.push({ path: 'categoryIds', message: 'Some of these categories no longer exist' });
    }
    if (errors.length)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        'Some of the information provided is not valid.',
        errors,
      );
  }

  private async discountGiven(ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const sums = await this.prisma.couponUsage.groupBy({
      by: ['couponId'],
      where: { couponId: { in: ids } },
      _sum: { discount: true },
    });
    return new Map(sums.map((s) => [s.couponId, s._sum.discount ?? 0]));
  }
}

function fields(i: CouponInput) {
  return {
    code: i.code,
    description: i.description,
    type: i.type,
    value: i.value,
    maxDiscount: i.maxDiscount,
    minCartValue: i.minCartValue,
    startsAt: i.startsAt,
    endsAt: i.endsAt,
    usageLimit: i.usageLimit,
    usagePerUser: i.usagePerUser,
    firstOrderOnly: i.firstOrderOnly,
    productIds: [...new Set(i.productIds)],
    categoryIds: [...new Set(i.categoryIds)],
    isActive: i.isActive,
  };
}

function toDto(c: Coupon, discountGiven: number): AdminCouponDto {
  return {
    id: c.id,
    code: c.code,
    description: c.description,
    type: c.type,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minCartValue: c.minCartValue,
    startsAt: c.startsAt?.toISOString() ?? null,
    endsAt: c.endsAt?.toISOString() ?? null,
    usageLimit: c.usageLimit,
    usagePerUser: c.usagePerUser,
    usedCount: c.usedCount,
    firstOrderOnly: c.firstOrderOnly,
    productIds: c.productIds,
    categoryIds: c.categoryIds,
    isActive: c.isActive,
    state: couponState(c),
    discountGiven,
    createdAt: c.createdAt.toISOString(),
  };
}
