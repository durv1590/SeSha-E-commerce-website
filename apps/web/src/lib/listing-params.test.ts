import { describe, expect, it } from 'vitest';
import { listingHref, toListingParams } from './listing-params';

describe('listing params', () => {
  it('joins repeated brand params into CSV and drops unknown keys', () => {
    const p = toListingParams({
      brand: ['aurora', 'voltix'],
      utm_source: 'ad',
      min: '500',
      sort: '',
    });
    expect(p.toString()).toBe('brand=aurora%2Cvoltix&min=500');
  });

  it('applies fixed params that the URL cannot override', () => {
    const p = toListingParams({ category: 'evil', sort: 'newest' }, { category: 'audio' });
    expect(p.get('category')).toBe('audio');
  });

  it('builds hrefs that reset the page when filters change and hide fixed keys', () => {
    const current = new URLSearchParams('category=audio&brand=aurora&page=3');
    expect(listingHref('/category/audio', current, { brand: null }, ['category'])).toBe(
      '/category/audio',
    );
    expect(listingHref('/category/audio', current, { page: '4' }, ['category'])).toBe(
      '/category/audio?brand=aurora&page=4',
    );
  });

  it('keeps the search text through filter and page changes', () => {
    const current = toListingParams({ q: 'wireless earbuds', brand: 'aurora', page: '2' });
    expect(current.get('q')).toBe('wireless earbuds');
    expect(listingHref('/search', current, { brand: null })).toBe('/search?q=wireless+earbuds');
  });
});
