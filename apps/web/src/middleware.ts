import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, createNonce } from '@/lib/security-headers';

// /checkout is open: guests can check out without an account.
const PROTECTED = ['/account', '/admin'];
const CSRF_COOKIE = 'sk_csrf';

const isDev = process.env.NODE_ENV !== 'production';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.seshakart.com';
const analytics = {
  ga: /^G-[A-Z0-9]{4,20}$/.test(process.env.NEXT_PUBLIC_ANALYTICS_ID?.trim() ?? ''),
  meta: /^\d{6,20}$/.test(process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() ?? ''),
};

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Edge middleware (runs before pages):
 * 1. Protected sections: signed-out visitors go to /login; visitors whose short-lived
 *    access token expired but who still have a session are renewed via the API
 *    (the refresh token itself never reaches this server).
 * 2. Ensures every browser has a CSRF cookie before its first form submission.
 * 3. Sets the Content-Security-Policy with a fresh script nonce. Next.js reads it from
 *    the request header and adds the nonce to its own scripts.
 *
 * This is a UX layer only — every API call is authorised by the API itself.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !req.cookies.has('sk_at')) {
    const next = encodeURIComponent(pathname + search);
    const url = req.nextUrl.clone();
    url.search = '';
    if (req.cookies.has('sk_sess')) {
      url.pathname = '/api/auth/session/renew';
      url.search = `?next=${next}`;
    } else {
      url.pathname = '/login';
      url.search = `?next=${next}`;
    }
    return NextResponse.redirect(url); // a redirect has no document to protect
  }

  const csp = buildContentSecurityPolicy({
    nonce: createNonce(),
    isDev,
    https: siteUrl.startsWith('https://'),
    analytics,
  });
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('Content-Security-Policy', csp);
  if (!req.cookies.has(CSRF_COOKIE)) {
    res.cookies.set(CSRF_COOKIE, randomToken(), {
      path: '/',
      sameSite: 'lax',
      secure: (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://').startsWith('https://'),
      httpOnly: false,
    });
  }
  return res;
}

export const config = {
  // Pages only — skip the API proxy, Next internals and static files.
  matcher: ['/((?!api/|_next/|brand/|favicon|icon|apple-icon|robots|sitemap|.*\\.[a-z0-9]+$).*)'],
};
