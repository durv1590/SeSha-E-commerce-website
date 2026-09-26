import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Role } from '@prisma/client';
import {
  ROLE_PERMISSIONS,
  type AdminAlertDto,
  type AdminReviewDto,
  type AuditEntryDto,
  type PaginationMeta,
  type Permission,
  type StaffMemberDto,
} from '@seshakart/types';
import type {
  AdminReviewListQuery,
  AuditQuery,
  ReviewModerationInput,
  StaffInviteInput,
  StaffUpdateInput,
} from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { SessionService } from '../../auth/session.service';
import { RevalidationService } from '../../cache/revalidation.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { PrismaService } from '../../database/prisma.service';
import { MessagingService } from '../../messaging/messaging.service';
import { staffInviteEmail } from '../../messaging/templates';
import { recomputeRating } from '../../reviews/rating';
import type { Actor } from '../actor';
import { DashboardService } from '../dashboard.service';

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  INVENTORY_MANAGER: 'Inventory manager',
  CUSTOMER_SUPPORT: 'Customer support',
  CUSTOMER: 'Customer',
};
const STAFF: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'INVENTORY_MANAGER', 'CUSTOMER_SUPPORT'];
const page = (p: number, size: number, total: number): PaginationMeta => ({
  page: p,
  pageSize: size,
  total,
  totalPages: Math.max(1, Math.ceil(total / size)),
});

/** Review moderation, the admin alert bell, the audit log and staff accounts. */
@Injectable()
export class EngagementAdminService {
  private readonly logger = new Logger('StaffAdmin');

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
    private readonly sessions: SessionService,
    private readonly messaging: MessagingService,
    private readonly dashboard: DashboardService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ------------------------------------------------------------------ reviews

  async reviews(
    q: AdminReviewListQuery,
  ): Promise<{ data: AdminReviewDto[]; meta: PaginationMeta }> {
    const where: Prisma.ReviewWhereInput = {
      ...(q.status !== 'all' ? { status: q.status } : {}),
      ...(q.rating ? { rating: q.rating } : {}),
      ...(q.q
        ? {
            OR: [
              { body: { contains: q.q, mode: 'insensitive' } },
              { title: { contains: q.q, mode: 'insensitive' } },
              { product: { name: { contains: q.q, mode: 'insensitive' } } },
              { user: { name: { contains: q.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        // Oldest pending first (waiting longest); otherwise newest first.
        orderBy: q.status === 'PENDING' ? [{ updatedAt: 'asc' }] : [{ updatedAt: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          product: { select: { id: true, name: true, slug: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);
    const mods = await this.names(rows.map((r) => r.moderatedById));
    return {
      data: rows.map((r) => ({
        id: r.id,
        product: r.product,
        customer: r.user,
        rating: r.rating,
        title: r.title,
        body: r.body,
        isVerifiedPurchase: r.isVerifiedPurchase,
        status: r.status,
        moderationNote: r.moderationNote,
        moderatedBy: r.moderatedById ? (mods.get(r.moderatedById) ?? 'Former staff member') : null,
        moderatedAt: r.moderatedAt?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      meta: page(q.page, q.pageSize, total),
    };
  }

  async moderate(id: string, input: ReviewModerationInput, actor: Actor): Promise<void> {
    const r = await this.prisma.review.findUnique({ where: { id } });
    if (!r) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This review doesn’t exist.');
    const status = input.action === 'approve' ? 'APPROVED' : 'REJECTED';
    await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id },
        data: {
          status,
          moderatedById: actor.userId,
          moderatedAt: new Date(),
          moderationNote: input.note ?? null,
        },
      });
      await recomputeRating(tx, r.productId);
      await this.audit.record(
        {
          actorId: actor.userId,
          action: `review.${input.action === 'approve' ? 'approved' : 'rejected'}`,
          entityType: 'review',
          entityId: id,
          metadata: { productId: r.productId, rating: r.rating, note: input.note ?? null },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    await this.revalidation.catalogChanged();
  }

  // ------------------------------------------------------------------- alerts

  /** "Needs attention" counts for the admin bell, limited to what the viewer may act on. */
  async alerts(role: Role): Promise<AdminAlertDto[]> {
    const can = (p: Permission) => ROLE_PERMISSIONS[role]?.includes(p) ?? false;
    const q = await this.dashboard.queues();
    const all: (AdminAlertDto & { need: Permission })[] = [
      {
        key: 'to_ship',
        label: 'Orders to ship',
        count: q.toShip,
        href: '/admin/orders?status=to_ship',
        tone: 'info',
        need: 'orders:read',
      },
      {
        key: 'returns',
        label: 'Return requests',
        count: q.openReturns,
        href: '/admin/returns',
        tone: 'warning',
        need: 'orders:read',
      },
      {
        key: 'manual_refunds',
        label: 'Manual refunds to pay',
        count: q.pendingManualRefunds,
        href: '/admin/orders?status=refund_pending',
        tone: 'warning',
        need: 'orders:refund',
      },
      {
        key: 'reviews',
        label: 'Reviews to moderate',
        count: q.pendingReviews,
        href: '/admin/reviews',
        tone: 'info',
        need: 'reviews:moderate',
      },
      {
        key: 'out_of_stock',
        label: 'Variants out of stock',
        count: q.outOfStock,
        href: '/admin/inventory?stock=out',
        tone: 'warning',
        need: 'inventory:read',
      },
      {
        key: 'low_stock',
        label: 'Variants low on stock',
        count: q.lowStock,
        href: '/admin/inventory?stock=low',
        tone: 'info',
        need: 'inventory:read',
      },
    ];
    return all.filter((a) => a.count > 0 && can(a.need)).map(({ need: _need, ...a }) => a);
  }

  // -------------------------------------------------------------------- audit

  async auditLog(q: AuditQuery): Promise<{ data: AuditEntryDto[]; meta: PaginationMeta }> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:30`) } : {}),
              ...(q.to
                ? { lt: new Date(new Date(`${q.to}T00:00:00+05:30`).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actor: r.actor
          ? { id: r.actor.id, name: r.actor.name, role: ROLE_LABELS[r.actor.role] }
          : null,
        metadata: r.metadata,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: page(q.page, q.pageSize, total),
    };
  }

  // -------------------------------------------------------------------- staff

  async staff(viewerId: string): Promise<StaffMemberDto[]> {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: STAFF } },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(),
      hasPassword: Boolean(u.passwordHash),
      isSelf: u.id === viewerId,
    }));
  }

  /**
   * Adds a staff member by email. A new account gets no password: the invitation
   * asks them to set one with "Forgot password". An existing customer account is
   * given the staff role (their sessions are refreshed so the change applies).
   */
  async invite(input: StaffInviteInput, actor: Actor): Promise<StaffMemberDto[]> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing && existing.role !== 'CUSTOMER')
      throw new AppException(
        HttpStatus.CONFLICT,
        'ALREADY_STAFF',
        'This person is already a staff member.',
        [{ path: 'email', message: 'Already on the staff list' }],
      );
    const inviter = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { name: true },
    });
    const user = await this.prisma.$transaction(async (tx) => {
      const u = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { role: input.role } })
        : await tx.user.create({
            data: { name: input.name, email: input.email, role: input.role },
          });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: existing ? 'staff.promoted' : 'staff.invited',
          entityType: 'user',
          entityId: u.id,
          metadata: { email: input.email, role: input.role },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return u;
    });
    if (existing) await this.sessions.invalidateUser(user.id);
    try {
      await this.messaging.sendEmail({
        to: input.email,
        ...staffInviteEmail({
          name: user.name,
          role: ROLE_LABELS[input.role],
          invitedBy: inviter.name,
          resetUrl: `${this.env.APP_URL}/forgot-password`,
          loginUrl: `${this.env.APP_URL}/login?next=%2Fadmin`,
        }),
      });
    } catch (err) {
      this.logger.warn(`Staff invitation email failed: ${(err as Error).message}`);
    }
    return this.staff(actor.userId);
  }

  async updateStaff(id: string, input: StaffUpdateInput, actor: Actor): Promise<StaffMemberDto[]> {
    if (id === actor.userId)
      throw new AppException(
        HttpStatus.CONFLICT,
        'CANNOT_CHANGE_SELF',
        'You can’t change your own role or access.',
      );
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role === 'CUSTOMER')
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This staff member doesn’t exist.');
    const leavingSuper =
      user.role === 'SUPER_ADMIN' && (input.role !== 'SUPER_ADMIN' || input.status !== 'ACTIVE');
    if (leavingSuper) {
      const supers = await this.prisma.user.count({
        where: { role: 'SUPER_ADMIN', status: 'ACTIVE' },
      });
      if (supers <= 1)
        throw new AppException(
          HttpStatus.CONFLICT,
          'LAST_SUPER_ADMIN',
          'The store needs at least one active super admin.',
        );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { role: input.role, status: input.status } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: input.role === 'CUSTOMER' ? 'staff.removed' : 'staff.updated',
          entityType: 'user',
          entityId: id,
          metadata: { from: { role: user.role, status: user.status }, to: input },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    // Losing access takes effect at once: sign them out; a role change applies on the next request.
    if (input.status === 'SUSPENDED' || input.role === 'CUSTOMER')
      await this.sessions.revokeAll(id);
    await this.sessions.invalidateUser(id);
    return this.staff(actor.userId);
  }

  private async names(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
    if (!unique.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}
