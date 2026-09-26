import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AcceptedDto, AuthResultDto, MeDto } from '@seshakart/types';
import {
  forgotPasswordSchema,
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  type LoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@seshakart/validation';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { AppException } from '../common/filters/all-exceptions.filter';
import { ZodBody } from '../common/validation/zod.pipe';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { clearGuestToken, readGuestToken } from '../cart/cart-cookie';
import { CartService } from '../cart/cart.service';
import { toMeDto } from '../users/user.mapper';
import { AuthService, OTP_SENT_MESSAGE, type LoginResult, type RequestMeta } from './auth.service';
import { CLIENT_TYPE_HEADER, type AuthContext } from './auth.types';
import { clearAuthCookies, REFRESH_COOKIE, safeRedirectPath, setAuthCookies } from './cookies';
import { Authenticated, CurrentAuth } from './decorators';
import { SessionService } from './session.service';

const MINUTE = 60_000;

function meta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.header('user-agent') ?? undefined };
}

function isAppClient(req: Request): boolean {
  return req.header(CLIENT_TYPE_HEADER) === 'app';
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly carts: CartService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private readonly logger = new Logger('Auth');

  /**
   * A fresh sign-in: the guest cart (if any) joins the account's cart, then the
   * session is issued. A merge failure never blocks signing in.
   */
  private async signedIn(req: Request, res: Response, result: LoginResult): Promise<AuthResultDto> {
    const guestToken = readGuestToken(req);
    if (guestToken) {
      try {
        await this.carts.mergeGuestCart(result.user.id, guestToken);
        if (!isAppClient(req)) clearGuestToken(res, this.env);
      } catch (err) {
        this.logger.warn(`Guest cart merge failed: ${(err as Error).message}`);
      }
    }
    return this.respond(req, res, result);
  }

  /** Browsers: tokens as HttpOnly cookies only. Native apps: tokens in the body. */
  private respond(req: Request, res: Response, result: LoginResult): AuthResultDto {
    if (isAppClient(req)) {
      return {
        user: result.user,
        tokens: {
          accessToken: result.access.token,
          refreshToken: result.session.refreshToken,
          accessTokenExpiresAt: result.access.expiresAt.toISOString(),
        },
      };
    }
    setAuthCookies(res, this.env, {
      accessToken: result.access.token,
      accessExpiresAt: result.access.expiresAt,
      refreshToken: result.session.refreshToken,
      refreshExpiresAt: result.session.refreshExpiresAt,
    });
    return { user: result.user };
  }

  /** Ensures the browser has a CSRF cookie before its first state-changing call. */
  @Get('csrf')
  csrf(): { ok: true } {
    return { ok: true };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 10 * MINUTE } })
  async register(
    @ZodBody(registerSchema) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResultDto> {
    return this.signedIn(req, res, await this.auth.register(body, meta(req)));
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: MINUTE } })
  async login(
    @ZodBody(loginSchema) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResultDto> {
    return this.signedIn(
      req,
      res,
      await this.auth.loginWithPassword(body.identifier, body.password, meta(req)),
    );
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 10 * MINUTE } })
  async requestOtp(@ZodBody(otpRequestSchema) body: OtpRequestInput): Promise<AcceptedDto> {
    await this.auth.requestLoginOtp(body.identifier);
    return { message: OTP_SENT_MESSAGE };
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE } })
  async verifyOtp(
    @ZodBody(otpVerifySchema) body: OtpVerifyInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResultDto> {
    return this.signedIn(
      req,
      res,
      await this.auth.loginWithOtp(body.identifier, body.code, meta(req)),
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  async refresh(
    @ZodBody(refreshSchema) body: z.infer<typeof refreshSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResultDto> {
    const token = isAppClient(req)
      ? body.refreshToken
      : (req.cookies?.[REFRESH_COOKIE] as string | undefined);
    if (!token) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'SESSION_EXPIRED',
        'Your session has expired. Please sign in again.',
      );
    }
    try {
      return this.respond(req, res, await this.auth.refresh(token, meta(req)));
    } catch (err) {
      if (!isAppClient(req)) clearAuthCookies(res, this.env);
      throw err;
    }
  }

  /**
   * Page-navigation renewal: the storefront redirects here when the access token has
   * expired but a session exists. Rotates the refresh token, then redirects back.
   * Safe as a GET: it can only renew the caller's own session, and the redirect target
   * is restricted to same-site paths.
   */
  @Get('session/renew')
  @Throttle({ default: { limit: 30, ttl: MINUTE } })
  async renew(
    @Query('next') next: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const target = safeRedirectPath(next, '/');
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    try {
      if (!token) throw new Error('no refresh token');
      this.respond(req, res, await this.auth.refresh(token, meta(req)));
      res.redirect(303, target);
    } catch {
      clearAuthCookies(res, this.env);
      res.redirect(303, `/login?next=${encodeURIComponent(target)}`);
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AcceptedDto> {
    if (req.auth) await this.sessions.revoke(req.auth.sessionId, req.auth.userId);
    clearAuthCookies(res, this.env);
    return { message: 'You have been signed out.' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @Authenticated()
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AcceptedDto> {
    await this.sessions.revokeAll(auth.userId);
    clearAuthCookies(res, this.env);
    return { message: 'You have been signed out on all devices.' };
  }

  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 10 * MINUTE } })
  async forgot(
    @ZodBody(forgotPasswordSchema) body: z.infer<typeof forgotPasswordSchema>,
  ): Promise<AcceptedDto> {
    await this.auth.requestPasswordReset(body.identifier);
    return { message: OTP_SENT_MESSAGE };
  }

  @Post('password/reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 10 * MINUTE } })
  async reset(
    @ZodBody(resetPasswordSchema) body: ResetPasswordInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AcceptedDto> {
    await this.auth.resetPassword(body.identifier, body.code, body.password, meta(req));
    clearAuthCookies(res, this.env);
    return { message: 'Your password has been reset. Please sign in with your new password.' };
  }

  @Get('me')
  @Authenticated()
  async me(@CurrentAuth() auth: AuthContext): Promise<MeDto> {
    return toMeDto(await this.prisma.user.findUniqueOrThrow({ where: { id: auth.userId } }));
  }
}
