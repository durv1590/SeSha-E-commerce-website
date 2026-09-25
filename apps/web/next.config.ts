import path from 'node:path';
import type { NextConfig } from 'next';
import { securityHeaders } from './src/lib/security-headers';

const isDev = process.env.NODE_ENV !== 'production';
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
    return [{ source: '/:path*', headers: securityHeaders({ isDev }) }];
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
    // Browsers call the API through the storefront origin (/api/*). This keeps auth
    // cookies first-party (SameSite=Lax, no third-party cookie issues) and CORS closed.
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }];
  },
};

export default nextConfig;
