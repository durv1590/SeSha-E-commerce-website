import type { SitemapDto } from '@seshakart/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSitemap } from './sitemap';

const feed: SitemapDto = {
  products: [
    { slug: 'pods', updatedAt: '2026-09-01T10:00:00.000Z', images: ['/api/media/p/pods.webp'] },
    { slug: 'hidden-one', updatedAt: '2026-09-02T10:00:00.000Z', images: [] },
  ],
  categories: [{ slug: 'audio', updatedAt: '2026-08-01T00:00:00.000Z' }],
  brands: [{ slug: 'aurora', updatedAt: '2026-08-02T00:00:00.000Z' }],
  pages: [{ slug: 'about-us', updatedAt: '2026-07-01T00:00:00.000Z' }],
};

describe('buildSitemap', () => {
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.seshakart.com';
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = saved;
  });

  it('lists static routes and every feed URL with absolute URLs and dates', () => {
    const now = new Date('2026-09-26T00:00:00Z');
    const map = buildSitemap(feed, new Set(), now);
    const urls = map.map((e) => e.url);
    expect(urls).toContain('https://www.seshakart.com/');
    expect(urls).toContain('https://www.seshakart.com/deals');
    expect(urls).toContain('https://www.seshakart.com/category/audio');
    expect(urls).toContain('https://www.seshakart.com/brand/aurora');
    expect(urls).toContain('https://www.seshakart.com/pages/about-us');
    const pods = map.find((e) => e.url.endsWith('/product/pods'))!;
    expect(pods.lastModified).toEqual(new Date('2026-09-01T10:00:00.000Z'));
    expect(pods.images).toEqual(['https://www.seshakart.com/api/media/p/pods.webp']);
    expect(map.find((e) => e.url.endsWith('/product/hidden-one'))!.images).toBeUndefined();
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('leaves out paths an admin hid from search engines', () => {
    const urls = buildSitemap(feed, new Set(['/product/hidden-one', '/deals'])).map((e) => e.url);
    expect(urls).not.toContain('https://www.seshakart.com/product/hidden-one');
    expect(urls).not.toContain('https://www.seshakart.com/deals');
  });

  it('still lists the static routes when the feed is unavailable', () => {
    expect(buildSitemap(null, new Set()).length).toBeGreaterThan(5);
  });
});
