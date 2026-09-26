import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { Role, UserStatus } from '@prisma/client';
import { CacheService } from '../cache/cache.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { hmac, randomToken } from './crypto';

export interface SessionState {
  active: boolean;
  userId: string;
  role: Role;
  status: UserStatus;
}

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const STATE_TTL_SECONDS = 60;
const MAX_SESSIONS_PER_USER = 20;

/**
 * Server-side sessions backing refresh tokens.
 *
 * - Refresh tokens are random 256-bit values; only an HMAC is stored.
 * - Every refresh ROTATES the token. Presenting an already-rotated token is treated
 *   as theft (RFC 6819 §5.2.2.3): all of the user's sessions are revoked.
 * - Access tokens are checked against the session state (cached ≤ 60 s), so logout,
 *   suspension and role changes take effect quickly despite stateless JWTs.
 */
@Injectable()
export class SessionService {
  private readonly logger = new Logger('Sessions');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private hash(token: string): string {
    return hmac(this.env.SESSION_SECRET, `refresh:${token}`);
  }

  private get refreshTtlMs(): number {
    return this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  async create(userId: string, meta: { userAgent?: string; ip?: string }): Promise<IssuedSession> {
    const refreshToken = randomToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hash(refreshToken),
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        ip: meta.ip ?? null,
        expiresAt: refreshExpiresAt,
      },
    });
    await this.pruneOldest(userId);
    return { sessionId: session.id, refreshToken, refreshExpiresAt };
  }

  /** Exchanges a refresh token for a new one (rotation with reuse detection). */
  async rotate(
    refreshToken: string,
    meta: { userAgent?: string; ip?: string },
  ): Promise<IssuedSession & { userId: string }> {
    const invalid = () =>
      new AppException(
        HttpStatus.UNAUTHORIZED,
        'SESSION_EXPIRED',
        'Your session has expired. Please sign in again.',
      );

    const hash = this.hash(refreshToken);
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });
    if (!session) {
      // Unknown token: possibly one that was already rotated. Check the rotation trail.
      const reused = await this.prisma.session.findFirst({
        where: { previousRefreshTokenHash: hash },
        select: { userId: true },
      });
      if (reused) {
        this.logger.warn(
          `Refresh token reuse detected for user ${reused.userId}; revoking all sessions`,
        );
        await this.revokeAll(reused.userId);
      }
      throw invalid();
    }
    if (session.revokedAt || session.expiresAt <= new Date()) throw invalid();

    const next = randomToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);
    // Conditional update: two concurrent refreshes with the same token cannot both win.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: hash, revokedAt: null },
      data: {
        refreshTokenHash: this.hash(next),
        previousRefreshTokenHash: hash,
        expiresAt: refreshExpiresAt,
        lastUsedAt: new Date(),
        userAgent: meta.userAgent?.slice(0, 300) ?? session.userAgent,
        ip: meta.ip ?? session.ip,
      },
    });
    if (count !== 1) throw invalid();
    return { sessionId: session.id, userId: session.userId, refreshToken: next, refreshExpiresAt };
  }

  /** Session + user state for access-token validation (cached briefly). */
  async state(sessionId: string): Promise<SessionState | null> {
    const cached = await this.cache.get<SessionState | { missing: true }>(`session:${sessionId}`);
    if (cached) return 'missing' in cached ? null : cached;

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { role: true, status: true } },
      },
    });
    const value: SessionState | null = session
      ? {
          active: !session.revokedAt && session.expiresAt > new Date(),
          userId: session.userId,
          role: session.user.role,
          status: session.user.status,
        }
      : null;
    await this.cache.set(`session:${sessionId}`, value ?? { missing: true }, STATE_TTL_SECONDS);
    return value;
  }

  async revoke(sessionId: string, userId?: string): Promise<boolean> {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, ...(userId ? { userId } : {}), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.cache.del(`session:${sessionId}`);
    return count > 0;
  }

  /** Revokes every session of a user, optionally keeping the current one. */
  async revokeAll(userId: string, exceptSessionId?: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
      },
      select: { id: true },
    });
    if (sessions.length === 0) return;
    await this.prisma.session.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { revokedAt: new Date() },
    });
    await Promise.all(sessions.map((s) => this.cache.del(`session:${s.id}`)));
  }

  /** Drops cached state for all of a user's sessions (after a role/status change). */
  async invalidateUser(userId: string): Promise<void> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    await Promise.all(sessions.map((s) => this.cache.del(`session:${s.id}`)));
  }

  private async pruneOldest(userId: string): Promise<void> {
    const active = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastUsedAt: 'desc' },
      skip: MAX_SESSIONS_PER_USER,
      select: { id: true },
    });
    for (const s of active) await this.revoke(s.id);
  }
}
