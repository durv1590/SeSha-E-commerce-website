import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

interface AccessClaims {
  sub: string;
  sid: string;
  role: Role;
}

/** Short-lived, stateless access tokens (HS256 JWT). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get accessTtlSeconds(): number {
    return this.env.ACCESS_TOKEN_TTL_MINUTES * 60;
  }

  signAccess(claims: AccessClaims): { token: string; expiresAt: Date } {
    const token = this.jwt.sign(claims, {
      secret: this.env.JWT_SECRET,
      expiresIn: this.accessTtlSeconds,
      algorithm: 'HS256',
      issuer: 'seshakart-api',
      audience: 'seshakart',
    });
    return { token, expiresAt: new Date(Date.now() + this.accessTtlSeconds * 1000) };
  }

  /** Returns the claims, or null for any invalid/expired/tampered token. */
  verifyAccess(token: string): AccessClaims | null {
    try {
      return this.jwt.verify<AccessClaims>(token, {
        secret: this.env.JWT_SECRET,
        algorithms: ['HS256'], // never accept "none" or asymmetric-confusion tokens
        issuer: 'seshakart-api',
        audience: 'seshakart',
      });
    } catch {
      return null;
    }
  }
}
