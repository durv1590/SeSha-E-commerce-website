import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CustomerDetailDto, CustomerListItemDto, PaginationMeta } from '@seshakart/types';
import type { CustomerListQuery, CustomerStatusInput } from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { SessionService } from '../../auth/session.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../actor';
import { OrdersAdminService, toListItem } from './orders-admin.service';

interface Row {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: Date;
  order_count: bigint;
  total_spent: bigint;
  last_order_at: Date | null;
}

/** Spend counts confirmed orders that weren't cancelled (the dashboard's definition of a sale). */
const STATS = Prisma.sql`
  count(o."id") AS order_count,
  COALESCE(sum(o."grand_total") FILTER (WHERE o."confirmed_at" IS NOT NULL AND o."status" <> 'CANCELLED'), 0) AS total_spent,
  max(o."placed_at") AS last_order_at`;

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This customer doesn’t exist.');

/** Customer accounts (role CUSTOMER only; staff are managed separately). */
@Injectable()
export class CustomersAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly orders: OrdersAdminService,
  ) {}

  async list(q: CustomerListQuery): Promise<{ data: CustomerListItemDto[]; meta: PaginationMeta }> {
    const conds: Prisma.Sql[] = [Prisma.sql`u."role" = 'CUSTOMER'`];
    if (q.status !== 'all') conds.push(Prisma.sql`u."status" = ${q.status}::"UserStatus"`);
    if (q.q) {
      const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const digits = q.q.replace(/\D/g, '');
      conds.push(
        digits.length >= 4
          ? Prisma.sql`(u."name" ILIKE ${like} OR u."email" ILIKE ${like} OR u."phone" LIKE ${`%${digits.slice(-10)}%`})`
          : Prisma.sql`(u."name" ILIKE ${like} OR u."email" ILIKE ${like})`,
      );
    }
    const where = Prisma.join(conds, ' AND ');
    const order = {
      recent: Prisma.sql`u."created_at" DESC`,
      spent: Prisma.sql`total_spent DESC, u."created_at" DESC`,
      orders: Prisma.sql`order_count DESC, u."created_at" DESC`,
    }[q.sort];
    const [count, rows] = await Promise.all([
      this.prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "users" u WHERE ${where}`,
      this.prisma.$queryRaw<Row[]>`
        SELECT u."id", u."name", u."email", u."phone", u."status"::text AS status, u."created_at", ${STATS}
        FROM "users" u LEFT JOIN "orders" o ON o."user_id" = u."id"
        WHERE ${where}
        GROUP BY u."id"
        ORDER BY ${order}, u."id"
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    ]);
    const total = Number(count[0]?.n ?? 0);
    return {
      data: rows.map(toItem),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  async detail(id: string): Promise<CustomerDetailDto> {
    const [row] = await this.prisma.$queryRaw<Row[]>`
      SELECT u."id", u."name", u."email", u."phone", u."status"::text AS status, u."created_at", ${STATS}
      FROM "users" u LEFT JOIN "orders" o ON o."user_id" = u."id"
      WHERE u."id" = ${id} AND u."role" = 'CUSTOMER'
      GROUP BY u."id"`;
    if (!row) throw notFound();
    const [user, recent, activeSessions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id },
        include: { addresses: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] } },
      }),
      this.prisma.order.findMany({
        where: { userId: id },
        orderBy: { placedAt: 'desc' },
        take: 10,
        select: this.orders.selectForList(),
      }),
      this.prisma.session.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);
    return {
      ...toItem(row),
      emailVerified: Boolean(user.emailVerifiedAt),
      phoneVerified: Boolean(user.phoneVerifiedAt),
      marketingOptIn: user.marketingOptIn,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      addresses: user.addresses.map((a) => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        line: [a.line1, a.line2, a.landmark].filter(Boolean).join(', '),
        city: a.city,
        state: a.state,
        pincode: a.pincode,
        isDefault: a.isDefault,
      })),
      recentOrders: recent.map(toListItem),
      activeSessions,
    };
  }

  /** Suspending signs the customer out everywhere and blocks sign-in until reactivated. */
  async setStatus(
    id: string,
    input: CustomerStatusInput,
    actor: Actor,
  ): Promise<CustomerDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== 'CUSTOMER') throw notFound();
    if (user.status !== input.status) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { status: input.status } });
        await this.audit.record(
          {
            actorId: actor.userId,
            action: input.status === 'SUSPENDED' ? 'customer.suspended' : 'customer.reactivated',
            entityType: 'user',
            entityId: id,
            metadata: { reason: input.reason ?? null },
            ip: actor.ip,
            userAgent: actor.userAgent,
          },
          tx,
        );
      });
      if (input.status === 'SUSPENDED') await this.sessions.revokeAll(id);
      await this.sessions.invalidateUser(id);
    }
    return this.detail(id);
  }
}

function toItem(r: Row): CustomerListItemDto {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    orderCount: Number(r.order_count),
    totalSpent: Number(r.total_spent),
    lastOrderAt: r.last_order_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  };
}
