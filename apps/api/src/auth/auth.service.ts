import { HttpStatus, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Prisma, type OtpChannel, type User } from '@prisma/client';
import type { MeDto } from '@seshakart/types';
import type { Identifier, RegisterInput } from '@seshakart/validation';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { hashPassword, verifyPassword } from '../common/security/password';
import { PrismaService } from '../database/prisma.service';
import { MessagingService } from '../messaging/messaging.service';
import { passwordChangedEmail } from '../messaging/templates';
import { toMeDto } from '../users/user.mapper';
import { OtpService, type OtpTarget } from './otp.service';
import { SessionService, type IssuedSession } from './session.service';
import { TokenService } from './token.service';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

export interface LoginResult {
  user: MeDto;
  session: IssuedSession;
  access: { token: string; expiresAt: Date };
}

const INVALID_CREDENTIALS = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'Incorrect email/mobile or password.',
  );
const INVALID_CODE = () =>
  new AppException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CODE',
    'That code is incorrect or has expired. Request a new one.',
  );

/** Generic reply for flows that must not reveal whether an account exists. */
export const OTP_SENT_MESSAGE =
  'If an account exists for these details, we’ve sent a 6-digit code. It expires in 10 minutes.';

function channelFor(identifier: Identifier): OtpChannel {
  return identifier.type === 'email' ? 'EMAIL' : 'SMS';
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('Auth');
  /** Used to spend equal time on unknown accounts, so timing doesn't reveal which exist. */
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly otp: OtpService,
    private readonly audit: AuditService,
    private readonly messaging: MessagingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword('dummy-password-for-timing-1');
  }

  private findByIdentifier(identifier: Identifier): Promise<User | null> {
    return this.prisma.user.findUnique({
      where:
        identifier.type === 'email' ? { email: identifier.value } : { phone: identifier.value },
    });
  }

  private async issue(user: User, meta: RequestMeta): Promise<LoginResult> {
    const session = await this.sessions.create(user.id, meta);
    const access = this.tokens.signAccess({
      sub: user.id,
      sid: session.sessionId,
      role: user.role,
    });
    return { user: toMeDto(user), session, access };
  }

  private assertActive(user: User): void {
    if (user.status === 'SUSPENDED') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'ACCOUNT_SUSPENDED',
        'This account has been suspended. Please contact support.',
      );
    }
  }

  async register(input: RegisterInput, meta: RequestMeta): Promise<LoginResult> {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          passwordHash: await hashPassword(input.password),
          marketingOptIn: input.marketingOptIn,
        },
      });
      await this.audit.record({
        actorId: user.id,
        action: 'user.registered',
        entityType: 'user',
        entityId: user.id,
        ...meta,
      });
      return this.issue(user, meta);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const field = String((err.meta?.target as string[] | undefined)?.join(',') ?? '');
        throw new AppException(
          HttpStatus.CONFLICT,
          field.includes('phone') ? 'PHONE_TAKEN' : 'EMAIL_TAKEN',
          field.includes('phone')
            ? 'An account with this mobile number already exists. Please sign in instead.'
            : 'An account with this email already exists. Please sign in instead.',
        );
      }
      throw err;
    }
  }

  async loginWithPassword(
    identifier: Identifier,
    password: string,
    meta: RequestMeta,
  ): Promise<LoginResult> {
    const user = await this.findByIdentifier(identifier);
    if (!user || !user.passwordHash) {
      await verifyPassword(this.dummyHash, password); // equalise timing
      throw INVALID_CREDENTIALS();
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes, or sign in with a one-time code.`,
      );
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      const attempts = user.failedLoginAttempts + 1;
      const lock = attempts >= MAX_FAILED_LOGINS;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : undefined,
        },
      });
      if (lock) {
        await this.audit.record({
          actorId: user.id,
          action: 'user.locked_out',
          entityType: 'user',
          entityId: user.id,
          ...meta,
        });
      }
      throw INVALID_CREDENTIALS();
    }
    this.assertActive(user);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    return this.issue(updated, meta);
  }

  /** Sends a login code if (and only if) the account exists. The reply is always the same. */
  async requestLoginOtp(identifier: Identifier): Promise<void> {
    const target: OtpTarget = { channel: channelFor(identifier), value: identifier.value };
    const user = await this.findByIdentifier(identifier);
    if (!user || user.status === 'SUSPENDED') {
      // Still reject unavailable SMS so the response doesn't differ by account existence.
      if (target.channel === 'SMS' && !this.messaging.smsAvailable)
        await this.otp.issue(target, 'LOGIN');
      return;
    }
    await this.otp.issue(target, 'LOGIN');
  }

  async loginWithOtp(
    identifier: Identifier,
    code: string,
    meta: RequestMeta,
  ): Promise<LoginResult> {
    const target: OtpTarget = { channel: channelFor(identifier), value: identifier.value };
    if (!(await this.otp.verify(target, 'LOGIN', code))) throw INVALID_CODE();
    const user = await this.findByIdentifier(identifier);
    if (!user) throw INVALID_CODE();
    this.assertActive(user);
    // Receiving the code proves control of the channel, so mark it verified.
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        ...(target.channel === 'EMAIL'
          ? { emailVerifiedAt: user.emailVerifiedAt ?? new Date() }
          : {}),
        ...(target.channel === 'SMS'
          ? { phoneVerifiedAt: user.phoneVerifiedAt ?? new Date() }
          : {}),
      },
    });
    return this.issue(updated, meta);
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<LoginResult> {
    const rotated = await this.sessions.rotate(refreshToken, meta);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: rotated.userId } });
    if (user.status === 'SUSPENDED') {
      await this.sessions.revoke(rotated.sessionId);
      this.assertActive(user);
    }
    const access = this.tokens.signAccess({
      sub: user.id,
      sid: rotated.sessionId,
      role: user.role,
    });
    return { user: toMeDto(user), session: rotated, access };
  }

  async requestPasswordReset(identifier: Identifier): Promise<void> {
    const user = await this.findByIdentifier(identifier);
    const target: OtpTarget = { channel: channelFor(identifier), value: identifier.value };
    if (!user) {
      if (target.channel === 'SMS' && !this.messaging.smsAvailable)
        await this.otp.issue(target, 'RESET_PASSWORD');
      return;
    }
    await this.otp.issue(target, 'RESET_PASSWORD');
  }

  async resetPassword(
    identifier: Identifier,
    code: string,
    password: string,
    meta: RequestMeta,
  ): Promise<void> {
    const target: OtpTarget = { channel: channelFor(identifier), value: identifier.value };
    if (!(await this.otp.verify(target, 'RESET_PASSWORD', code))) throw INVALID_CODE();
    const user = await this.findByIdentifier(identifier);
    if (!user) throw INVALID_CODE();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(password),
        failedLoginAttempts: 0,
        lockedUntil: null,
        ...(target.channel === 'EMAIL'
          ? { emailVerifiedAt: user.emailVerifiedAt ?? new Date() }
          : {}),
        ...(target.channel === 'SMS'
          ? { phoneVerifiedAt: user.phoneVerifiedAt ?? new Date() }
          : {}),
      },
    });
    // A reset means the old password may be compromised: sign out everywhere.
    await this.sessions.revokeAll(user.id);
    await this.audit.record({
      actorId: user.id,
      action: 'user.password_reset',
      entityType: 'user',
      entityId: user.id,
      ...meta,
    });
    await this.notifyPasswordChanged(user);
  }

  async notifyPasswordChanged(user: User): Promise<void> {
    if (!user.email) return;
    try {
      await this.messaging.sendEmail({ to: user.email, ...passwordChangedEmail(user.name) });
    } catch (err) {
      this.logger.warn(`Password-changed email failed: ${(err as Error).message}`);
    }
  }
}
