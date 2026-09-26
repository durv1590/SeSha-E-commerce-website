import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env';
import { CLIENT_TYPE_HEADER } from './auth.types';
import { ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE, setCsrfCookie } from './cookies';
import { randomToken, safeEqual } from './crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Server-to-server callbacks authenticate with signatures instead (Phase 8). */
const EXEMPT_PREFIXES = ['/api/webhooks/'];

/**
 * CSRF protection (double-submit token), layered on top of SameSite=Lax cookies and
 * a closed CORS policy.
 *
 * Every browser gets a random `sk_csrf` cookie. State-changing requests must echo it
 * in the `X-CSRF-Token` header; another site can neither read the cookie nor set the
 * header.
 *
 * Native-app requests (`Authorization: Bearer …` or `X-Client-Type: app`) that carry
 * no auth cookies are exempt: CSRF abuses ambient cookies, and a cross-site page
 * cannot add these headers without a CORS preflight, which the API rejects.
 */
export function csrfProtection(env: Env) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let cookie = req.cookies?.[CSRF_COOKIE] as string | undefined;
    if (!cookie || cookie.length < 32) {
      cookie = randomToken();
      setCsrfCookie(res, env, cookie);
      req.cookies = { ...req.cookies, [CSRF_COOKIE]: undefined };
    }

    if (SAFE_METHODS.has(req.method) || EXEMPT_PREFIXES.some((p) => req.path.startsWith(p)))
      return next();

    const hasAuthCookies = Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
    const appClient =
      req.header('authorization')?.startsWith('Bearer ') ||
      req.header(CLIENT_TYPE_HEADER) === 'app';
    if (appClient && !hasAuthCookies) return next();

    const sent = req.header(CSRF_HEADER);
    const expected = req.cookies?.[CSRF_COOKIE] as string | undefined;
    if (sent && expected && safeEqual(sent, expected)) return next();

    res.status(403).json({
      error: {
        code: 'CSRF_FAILED',
        message:
          'Your session security token is missing or invalid. Please refresh the page and try again.',
        requestId: req.header('x-request-id'),
      },
    });
  };
}
