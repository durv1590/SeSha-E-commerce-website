import type { SitemapDto } from '@seshakart/types';
import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/api/server';
import { getSeoOverrides } from '@/lib/content/api';
import { buildSitemap } from '@/lib/seo/sitemap';
import { isIndexable } from '@/lib/seo/site';

// Generated per request (the API responses are cached), never at build time.
export const dynamic = 'force-dynamic';

/** /sitemap.xml: every indexable store URL. Empty on non-production hosts. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];
  const [feed, overrides] = await Promise.all([
    // Not stored in Next's data cache (large catalogues exceed its 2 MB item limit);
    // the API serves the feed from Redis.
    serverApi<SitemapDto>('/sitemap', { auth: false })
      .then((r) => r.data)
      .catch(() => null), // the API being down must not take the static routes with it
    getSeoOverrides(),
  ]);
  return buildSitemap(feed, new Set(overrides.filter((o) => o.noindex).map((o) => o.path)));
}
