import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type Address, type User } from '@prisma/client';
import type { AddressDto, NotificationDto, SessionDto, UserDto } from '@seshakart/types';
import {
  ADDRESS_LIMIT,
  type AddressInput,
  type ChangePasswordInput,
  type UpdateProfileInput,
} from '@seshakart/validation';
import { AuditService } from '../audit/audit.service';
import { AuthService, type RequestMeta } from '../auth/auth.service';
import type { AuthContext } from '../auth/auth.types';
import { OtpService } from '../auth/otp.service';
import { SessionService } from '../auth/session.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { paginated } from '../common/http/envelope';
import { hashPassword, verifyPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { toUserDto } from './user.mapper';

function toAddressDto(a: Address): AddressDto {
  return {
    id: a.id,
    label: a.label,
    name: a.name,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    landmark: a.landmark,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  };
}

const NOT_FOUND = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Address not found.');

/**
 * Customer self-service. Every query is scoped by the authenticated user's id
 * (`where: { id, userId }`) — ids from the URL are never trusted on their own (IDOR).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  private async user(userId: string): Promise<User> {
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }

  // ------------------------------------------------------------------ profile

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDto> {
    const current = await this.user(userId);
    const email = input.email === undefined ? current.email : input.email;
    const phone = input.phone === undefined ? current.phone : input.phone;
    if (!email && !phone) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CONTACT_REQUIRED',
        'Keep at least an email address or a mobile number on your account.',
      );
    }
    try {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          marketingOptIn: input.marketingOptIn,
          email,
          phone,
          // A changed contact must be verified again.
          ...(email !== current.email ? { emailVerifiedAt: null } : {}),
          ...(phone !== current.phone ? { phoneVerifiedAt: null } : {}),
        },
      });
      return toUserDto(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(
          HttpStatus.CONFLICT,
          'CONTACT_TAKEN',
          'That email or mobile number is already used by another account.',
        );
      }
      throw err;
    }
  }

  async changePassword(
    auth: AuthContext,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.user(auth.userId);
    if (
      user.passwordHash &&
      !(input.currentPassword && (await verifyPassword(user.passwordHash, input.currentPassword)))
    ) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'WRONG_PASSWORD',
        'Your current password is incorrect.',
        [{ path: 'currentPassword', message: 'Your current password is incorrect.' }],
      );
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    // Keep this device signed in; sign out every other device.
    await this.sessions.revokeAll(user.id, auth.sessionId);
    await this.audit.record({
      actorId: user.id,
      action: 'user.password_changed',
      entityType: 'user',
      entityId: user.id,
      ...meta,
    });
    await this.auth.notifyPasswordChanged(user);
  }

  async requestContactVerification(userId: string, channel: 'EMAIL' | 'SMS'): Promise<void> {
    const user = await this.user(userId);
    const value = channel === 'EMAIL' ? user.email : user.phone;
    const verified = channel === 'EMAIL' ? user.emailVerifiedAt : user.phoneVerifiedAt;
    if (!value)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NO_CONTACT',
        `Add ${channel === 'EMAIL' ? 'an email address' : 'a mobile number'} first.`,
      );
    if (verified)
      throw new AppException(HttpStatus.CONFLICT, 'ALREADY_VERIFIED', 'This is already verified.');
    await this.otp.issue({ channel, value }, channel === 'EMAIL' ? 'VERIFY_EMAIL' : 'VERIFY_PHONE');
  }

  async confirmContactVerification(
    userId: string,
    channel: 'EMAIL' | 'SMS',
    code: string,
  ): Promise<UserDto> {
    const user = await this.user(userId);
    const value = channel === 'EMAIL' ? user.email : user.phone;
    const ok =
      value &&
      (await this.otp.verify(
        { channel, value },
        channel === 'EMAIL' ? 'VERIFY_EMAIL' : 'VERIFY_PHONE',
        code,
      ));
    if (!ok)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_CODE',
        'That code is incorrect or has expired. Request a new one.',
      );
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: channel === 'EMAIL' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() },
    });
    return toUserDto(updated);
  }

  // ------------------------------------------------------------------ sessions

  async listSessions(auth: AuthContext): Promise<SessionDto[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === auth.sessionId,
    }));
  }

  async revokeSession(auth: AuthContext, sessionId: string): Promise<void> {
    if (!(await this.sessions.revoke(sessionId, auth.userId))) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Session not found.');
    }
  }

  // ------------------------------------------------------------------ addresses

  async listAddresses(userId: string): Promise<AddressDto[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return rows.map(toAddressDto);
  }

  async createAddress(userId: string, input: AddressInput): Promise<AddressDto> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= ADDRESS_LIMIT) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'ADDRESS_LIMIT',
          `You can save up to ${ADDRESS_LIMIT} addresses.`,
        );
      }
      // The first address becomes the default automatically.
      const makeDefault = input.isDefault || count === 0;
      if (makeDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      const created = await tx.address.create({
        data: { ...input, isDefault: makeDefault, userId },
      });
      return toAddressDto(created);
    });
  }

  async updateAddress(
    userId: string,
    id: string,
    input: Partial<AddressInput>,
  ): Promise<AddressDto> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw NOT_FOUND();
      if (input.isDefault)
        await tx.address.updateMany({
          where: { userId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      // Un-defaulting the only default is not allowed; use "make default" on another address instead.
      const data = {
        ...input,
        isDefault: input.isDefault === false && existing.isDefault ? true : input.isDefault,
      };
      return toAddressDto(await tx.address.update({ where: { id }, data }));
    });
  }

  async deleteAddress(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw NOT_FOUND();
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
        });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }

  // ------------------------------------------------------------------ notifications

  async listNotifications(userId: string, page: number, pageSize: number) {
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const dtos: NotificationDto[] = items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
    return { envelope: paginated(dtos, total, page, pageSize), unread };
  }

  async markNotificationsRead(userId: string, id?: string): Promise<number> {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(id ? { id } : {}) },
      data: { readAt: new Date() },
    });
    return count;
  }
}
