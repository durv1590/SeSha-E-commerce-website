import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security-headers';

// One .env at the repository root serves the API, Prisma and this app.
// forceReload: Next has already loaded (and cached) env files from apps/web by now.
loadEnvConfig(
  path.join(__dirname, '../..'),
  process.env.NODE_ENV !== 'production',
  undefined,
  true,
);

const isDev = process.env.NODE_ENV !== 'production';
/**
 * HTTPS-only headers (HSTS, upgrade-insecure-requests) follow the site URL, not
 * NODE_ENV — a production build served over plain http (local QA) would otherwise
 * upgrade its own requests to https and break client-side navigation.
 */
const httpsSite = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.seshakart.com').startsWith(
  'https://',
);
/** Server-side address of the API (container network / localhost). Never exposed to browsers. */
const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';
/** Canonical production host — requests to the apex domain are redirected here. */
const canonicalHost = process.env.CANONICAL_HOST ?? 'www.seshakart.com';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  poweredByHeader: false,
  reactStrictMode: true,
  // The design-system package ships TypeScript source; Next compiles it with the app.
  transpilePackages: ['@seshakart/ui'],
  experimental: { optimizePackageImports: ['lucide-react', '@seshakart/ui'] },
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [48, 96, 160, 240, 320],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders({ isDev, https: httpsSite }) }];
  },
  async redirects() {
    if (isDev) return [];
    const apex = canonicalHost.replace(/^www\./, '');
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: apex }],
        destination: `https://${canonicalHost}/:path*`,
        permanent: true,
      },
    ];
  },
  async rewrites() {
    // Browsers call the API on the storefront origin (/api/*), keeping auth cookies
    // first-party and CORS closed. In PRODUCTION the edge proxy (infra/nginx) routes
    // /api/* straight to the API with the client IP; this rewrite is the development
    // fallback. It does NOT forward client IPs, so never rely on it for rate limiting.
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }];
  },
};

export default nextConfig;
