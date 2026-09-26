/**
 * HTTP security headers for every storefront response.
 *
 * CSP note: Next.js injects inline bootstrap scripts, so `script-src` needs
 * 'unsafe-inline' unless every page is rendered with a per-request nonce (which
 * disables static rendering and CDN caching). We accept that trade-off and keep
 * every other directive strict. Analytics origins are added only for the tools that
 * are configured (and the tags themselves load only after cookie consent).
 * See docs/SECURITY.md.
 */

/**
 * Razorpay Checkout: its script, the iframe it opens, and the endpoints the iframe's
 * parent page talks to. Nothing else from payment providers is allowed.
 */
export const PAYMENT_ORIGINS = {
  script: ['https://checkout.razorpay.com'],
  frame: ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
  connect: ['https://api.razorpay.com', 'https://lumberjack.razorpay.com'],
};
/** Google Analytics 4 and Meta Pixel endpoints (per each vendor's CSP guidance). */
export const ANALYTICS_ORIGINS = {
  ga: {
    script: ['https://*.googletagmanager.com'],
    connect: [
      'https://*.google-analytics.com',
      'https://*.analytics.google.com',
      'https://*.googletagmanager.com',
    ],
  },
  meta: {
    script: ['https://connect.facebook.net'],
    connect: ['https://www.facebook.com', 'https://connect.facebook.net'],
  },
};

export interface HeaderOptions {
  isDev: boolean;
  /** Site is served over HTTPS: enables HSTS and upgrade-insecure-requests. */
  https?: boolean;
  apiOrigin?: string;
  /** Configured trackers; their origins are allowed only when set. */
  analytics?: { ga?: boolean; meta?: boolean };
}

export function buildContentSecurityPolicy(opts: HeaderOptions): string {
  const tools = [
    opts.analytics?.ga && ANALYTICS_ORIGINS.ga,
    opts.analytics?.meta && ANALYTICS_ORIGINS.meta,
  ].filter((t): t is (typeof ANALYTICS_ORIGINS)['ga'] => Boolean(t));
  const connect = [
    "'self'",
    opts.apiOrigin,
    ...PAYMENT_ORIGINS.connect,
    ...tools.flatMap((t) => t.connect),
  ]
    .filter(Boolean)
    .join(' ');
  const scripts = [...PAYMENT_ORIGINS.script, ...tools.flatMap((t) => t.script)].join(' ');
  const directives: Record<string, string> = {
    'default-src': "'self'",
    'script-src': `'self' 'unsafe-inline'${opts.isDev ? " 'unsafe-eval'" : ''} ${scripts}`,
    'style-src': "'self' 'unsafe-inline'",
    'img-src': "'self' data: blob: https:",
    'font-src': "'self' data:",
    'connect-src': opts.isDev ? `${connect} ws:` : connect,
    'frame-src': PAYMENT_ORIGINS.frame.join(' '),
    'frame-ancestors': "'none'",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
  };
  const policy = Object.entries(directives).map(([k, v]) => `${k} ${v}`);
  if (opts.https ?? !opts.isDev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

export function securityHeaders(opts: HeaderOptions) {
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
  if (opts.https ?? !opts.isDev) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=63072000; includeSubDomains; preload',
    });
  }
  return headers;
}
