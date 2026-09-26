import type { MetadataRoute } from 'next';
import { absoluteUrl, isIndexable, PRIVATE_PATHS } from '@/lib/seo/site';

// Decided per request from the environment, never baked in at build time.
export const dynamic = 'force-dynamic';

/** robots.txt: private areas are off-limits; non-production hosts are closed entirely. */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: { userAgent: '*', allow: '/', disallow: PRIVATE_PATHS },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
