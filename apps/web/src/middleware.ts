import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/account', '/checkout', '/admin'];
const CSRF_COOKIE = 'sk_csrf';

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
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
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
