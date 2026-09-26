import type { SitemapDto } from '@seshakart/types';
import type { MetadataRoute } from 'next';
import { absoluteUrl } from './site';

/** Listing pages that always exist; product and taxonomy URLs come from the API feed. */
const STATIC_ROUTES: { path: string; changeFrequency: 'daily' | 'weekly'; priority: number }[] = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/products', changeFrequency: 'daily', priority: 0.8 },
  { path: '/categories', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/deals', changeFrequency: 'daily', priority: 0.7 },
  { path: '/best-sellers', changeFrequency: 'daily', priority: 0.7 },
  { path: '/new-arrivals', changeFrequency: 'daily', priority: 0.7 },
  { path: '/track-order', changeFrequency: 'weekly', priority: 0.3 },
];

/**
 * Builds sitemap entries. `hidden` holds paths an admin marked "hide from search engines"
 * (a noindex page must not be listed). Pure, so it can be tested without a server.
 */
export function buildSitemap(
  feed: SitemapDto | null,
  hidden: ReadonlySet<string>,
  now = new Date(),
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: absoluteUrl(r.path),
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
  if (feed) {
    const add = (
      prefix: string,
      rows: { slug: string; updatedAt: string; images?: string[] }[],
      priority: number,
    ) => {
      for (const r of rows)
        entries.push({
          url: absoluteUrl(`${prefix}/${r.slug}`),
          lastModified: new Date(r.updatedAt),
          changeFrequency: 'weekly',
          priority,
          ...(r.images?.length ? { images: r.images.map((i) => absoluteUrl(i)) } : {}),
        });
    };
    add('/category', feed.categories, 0.7);
    add('/brand', feed.brands, 0.5);
    add('/product', feed.products, 0.6);
    add('/pages', feed.pages, 0.3);
  }
  return entries.filter((e) => !hidden.has(new URL(e.url).pathname));
}
