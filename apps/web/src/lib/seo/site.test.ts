import { describe, expect, it } from 'vitest';
import { absoluteUrl, isIndexable, listingCanonical, pageMetadata, siteUrl } from './site';

const env = (e: Record<string, string>) => e as unknown as NodeJS.ProcessEnv;
const prod = env({ NEXT_PUBLIC_SITE_URL: 'https://www.seshakart.com/' });

describe('site URLs', () => {
  it('normalises the origin and builds absolute URLs', () => {
    expect(siteUrl(prod)).toBe('https://www.seshakart.com');
    expect(absoluteUrl('/product/x', prod)).toBe('https://www.seshakart.com/product/x');
    expect(absoluteUrl('pages/about', prod)).toBe('https://www.seshakart.com/pages/about');
    expect(absoluteUrl('https://cdn.example.com/a.webp', prod)).toBe(
      'https://cdn.example.com/a.webp',
    );
  });
});

describe('isIndexable', () => {
  it('allows only the canonical https production host', () => {
    expect(isIndexable(prod)).toBe(true);
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: 'https://staging.seshakart.com' }))).toBe(false);
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }))).toBe(false);
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: 'http://www.seshakart.com' }))).toBe(false);
    expect(isIndexable(env({ NEXT_PUBLIC_SITE_URL: 'not a url' }))).toBe(false);
  });

  it('follows CANONICAL_HOST and can be switched off before launch', () => {
    expect(
      isIndexable(
        env({ NEXT_PUBLIC_SITE_URL: 'https://shop.example.in', CANONICAL_HOST: 'shop.example.in' }),
      ),
    ).toBe(true);
    expect(isIndexable(env({ ...prod, ALLOW_INDEXING: 'false' }))).toBe(false);
  });
});

describe('listingCanonical', () => {
  it('drops filters and sort, keeps later page numbers', () => {
    expect(listingCanonical('/deals', {})).toBe('/deals');
    expect(listingCanonical('/deals', { sort: 'price_asc', brand: ['a', 'b'] })).toBe('/deals');
    expect(listingCanonical('/deals', { page: '1' })).toBe('/deals');
    expect(listingCanonical('/deals', { page: '3', sort: 'newest' })).toBe('/deals?page=3');
    expect(listingCanonical('/deals', { page: ['2', '5'] })).toBe('/deals?page=2');
    expect(listingCanonical('/deals', { page: 'x' })).toBe('/deals');
    expect(listingCanonical('/deals', { page: '2.5' })).toBe('/deals');
  });
});

describe('pageMetadata', () => {
  it('sends a complete Open Graph block with the default image', () => {
    const m = pageMetadata({ title: 'Deals', description: 'Big savings', path: '/deals' });
    expect(m.title).toBe('Deals');
    expect(m.alternates).toEqual({ canonical: '/deals' });
    expect(m.openGraph).toMatchObject({
      siteName: 'SeShaKart',
      locale: 'en_IN',
      url: '/deals',
      title: 'Deals',
      description: 'Big savings',
      images: [{ url: '/brand/social/og-default.jpg', width: 1200, height: 630 }],
    });
  });

  it('uses page images and absolute titles when given', () => {
    const m = pageMetadata({
      title: 'Home',
      absoluteTitle: true,
      description: null,
      path: '/',
      images: [{ url: '/api/media/a.webp', alt: 'A' }],
    });
    expect(m.title).toEqual({ absolute: 'Home' });
    expect(m.description).toBeUndefined();
    expect(m.openGraph?.images).toEqual([{ url: '/api/media/a.webp', alt: 'A' }]);
  });
});
