import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env';

export const ACCESS_COOKIE = 'sk_at';
export const REFRESH_COOKIE = 'sk_rt';
export const CSRF_COOKIE = 'sk_csrf';
/**
 * Non-secret marker ("a refresh session exists") readable by the web server. It lets
 * the storefront renew an expired access token on page navigation without the
 * refresh token itself ever leaving /api/auth.
 */
export const SESSION_MARKER_COOKIE = 'sk_sess';
export const CSRF_HEADER = 'x-csrf-token';

/** Refresh cookie is only ever sent to the auth endpoints, never to the rest of the API. */
export const REFRESH_COOKIE_PATH = '/api/auth';

function base(env: Env): CookieOptions {
  return {
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    domain: env.COOKIE_DOMAIN || undefined,
  };
}

export function setAuthCookies(
  res: Response,
  env: Env,
  tokens: {
    accessToken: string;
    accessExpiresAt: Date;
    refreshToken: string;
    refreshExpiresAt: Date;
  },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(env),
    httpOnly: true,
    path: '/',
    expires: tokens.accessExpiresAt,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(env),
    httpOnly: true,
    path: REFRESH_COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
  // Readable by page scripts on purpose: it holds no secret and lets the storefront skip
  // a network call for visitors who are clearly signed out.
  res.cookie(SESSION_MARKER_COOKIE, '1', {
    ...base(env),
    httpOnly: false,
    path: '/',
    expires: tokens.refreshExpiresAt,
  });
}

export function clearAuthCookies(res: Response, env: Env): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(env), httpOnly: true, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(env), httpOnly: true, path: REFRESH_COOKIE_PATH });
  res.clearCookie(SESSION_MARKER_COOKIE, { ...base(env), httpOnly: false, path: '/' });
}

/** Only same-site relative paths are allowed as post-login redirects (no open redirects). */
export function safeRedirectPath(value: unknown, fallback = '/'): string {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return fallback;
  }
  return value.slice(0, 500);
}

/** Readable by JS on purpose (double-submit CSRF token), useless to other origins. */
export function setCsrfCookie(res: Response, env: Env, token: string): void {
  res.cookie(CSRF_COOKIE, token, { ...base(env), httpOnly: false, path: '/' });
}
