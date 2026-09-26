import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAllPermissions, type Permission } from '@seshakart/types';
import type { Request } from 'express';
import { AppException } from '../common/filters/all-exceptions.filter';
import { ACCESS_COOKIE } from './cookies';
import { ANY_PERMISSIONS_KEY, AUTH_REQUIRED_KEY, PERMISSIONS_KEY } from './decorators';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Global guard.
 * 1. Authenticates the request if it carries an access token (HttpOnly cookie for
 *    browsers, `Authorization: Bearer` for native apps) and the session is still
 *    active — so logout, suspension and role changes apply within ~60 s.
 * 2. Enforces @Authenticated() and @RequirePermissions() metadata. Permissions are
 *    checked against the CURRENT role from the session store, never a stale JWT claim.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<Request>();
    await this.authenticate(req);

    const targets = [context.getHandler(), context.getClass()];
    const permissions = this.reflector.getAllAndOverride<Permission[] | undefined>(
      PERMISSIONS_KEY,
      targets,
    );
    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(
      ANY_PERMISSIONS_KEY,
      targets,
    );
    const required =
      this.reflector.getAllAndOverride<boolean | undefined>(AUTH_REQUIRED_KEY, targets) ||
      !!permissions ||
      !!anyOf;
    if (!required) return true;

    if (!req.auth) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Please sign in to continue.',
      );
    }
    if (
      (permissions && !hasAllPermissions(req.auth.role, permissions)) ||
      (anyOf && !anyOf.some((p) => hasAllPermissions(req.auth!.role, [p])))
    ) {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'You don’t have permission to do this.',
      );
    }
    return true;
  }

  private async authenticate(req: Request): Promise<void> {
    if (req.auth) return;
    const header = req.header('authorization');
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const token = bearer || (req.cookies?.[ACCESS_COOKIE] as string | undefined);
    if (!token) return;

    const claims = this.tokens.verifyAccess(token);
    if (!claims) return; // expired/invalid → treated as anonymous; client refreshes on 401
    const state = await this.sessions.state(claims.sid);
    if (!state || !state.active || state.status !== 'ACTIVE' || state.userId !== claims.sub) return;
    req.auth = { userId: state.userId, role: state.role, sessionId: claims.sid };
  }
}
