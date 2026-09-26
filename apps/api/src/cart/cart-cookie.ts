import type { Request, Response } from 'express';
import { CLIENT_TYPE_HEADER } from '../auth/auth.types';
import type { Env } from '../config/env';

/** Guest cart token: HttpOnly cookie for browsers, header for native apps. */
export const CART_COOKIE = 'sk_cart';
export const CART_TOKEN_HEADER = 'x-cart-token';
/** Sent to the cart and auth endpoints only (auth merges it on sign-in). */
const CART_COOKIE_PATH = '/api';

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function readGuestToken(req: Request): string | null {
  const value = (req.cookies?.[CART_COOKIE] as string | undefined) ?? req.header(CART_TOKEN_HEADER);
  return value && TOKEN_SHAPE.test(value) ? value : null;
}

/** Hands the (new or refreshed) guest token back to the client. */
export function writeGuestToken(
  req: Request,
  res: Response,
  env: Env,
  token: string,
  retentionDays: number,
): void {
  if (req.header(CLIENT_TYPE_HEADER) === 'app') {
    res.setHeader('X-Cart-Token', token);
    return;
  }
  res.cookie(CART_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
    path: CART_COOKIE_PATH,
    maxAge: retentionDays * 86_400_000,
  });
}

export function clearGuestToken(res: Response, env: Env): void {
  res.clearCookie(CART_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
    path: CART_COOKIE_PATH,
  });
}
