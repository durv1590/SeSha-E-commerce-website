import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@seshakart/types';
import type { Request } from 'express';
import type { AuthContext } from './auth.types';

export const AUTH_REQUIRED_KEY = 'auth:required';
export const PERMISSIONS_KEY = 'auth:permissions';
export const ANY_PERMISSIONS_KEY = 'auth:any-permissions';

/** Route (or controller) requires a signed-in user of any role. */
export const Authenticated = () => SetMetadata(AUTH_REQUIRED_KEY, true);

/**
 * Route (or controller) requires a signed-in STAFF user holding every listed
 * permission (see ROLE_PERMISSIONS). Implies @Authenticated().
 */
export const RequirePermissions = (...permissions: [Permission, ...Permission[]]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Route requires a signed-in STAFF user holding at least one of the listed permissions. */
export const RequireAnyPermission = (...permissions: [Permission, Permission, ...Permission[]]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

/** Injects the authenticated principal (guaranteed on @Authenticated routes). */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.auth!;
  },
);

/** Injects the principal if signed in, otherwise undefined (for public routes). */
export const OptionalAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext | undefined => {
    return ctx.switchToHttp().getRequest<Request>().auth;
  },
);
