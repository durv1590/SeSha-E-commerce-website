/**
 * HTTP security headers for every storefront response.
 *
 * CSP note: Next.js injects inline bootstrap scripts, so `script-src` needs
 * 'unsafe-inline' unless every page is rendered with a per-request nonce (which
 * disables static rendering and CDN caching). We accept that trade-off and keep
 * every other directive strict. Payment and analytics origins are added in the
 * phases that introduce them. See docs/SECURITY.md.
 */
export function buildContentSecurityPolicy(opts: { isDev: boolean; apiOrigin?: string }): string {
  const connect = ["'self'", opts.apiOrigin].filter(Boolean).join(' ');
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': `'self' 'unsafe-inline'${opts.isDev ? " 'unsafe-eval'" : ''}`,
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob: https:",
    'font-src': "'self' data:",
    'connect-src': opts.isDev ? `${connect} ws:` : connect,
    'frame-src': "'none'",
    'frame-ancestors': "'none'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v}`);
  if (!opts.isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function securityHeaders(opts: { isDev: boolean; apiOrigin?: string }) {
  const headers = [
    { key: 'Content-Security-Policy', value: buildContentSecurityPolicy(opts) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
  if (!opts.isDev) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }
  return headers;
}
