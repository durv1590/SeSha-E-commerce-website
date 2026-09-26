import { describe, expect, it } from 'vitest';
import { effectiveSort, productListQuerySchema } from './catalog';

describe('productListQuerySchema', () => {
  it('parses storefront URLs into typed filters (rupees → paise)', () => {
    const q = productListQuerySchema.parse({
      category: 'audio',
      brand: 'voltix, aurora-sound,voltix',
      min: '500',
      max: '4999',
      rating: '4',
      inStock: '1',
      sort: 'price_asc',
      page: '2',
    });
    expect(q).toEqual({
      category: 'audio',
      brand: ['voltix', 'aurora-sound'],
      min: 50000,
      max: 499900,
      rating: 4,
      inStock: true,
      sort: 'price_asc',
      page: 2,
      pageSize: 24,
    });
  });

  it('defaults to relevance for searches and popularity otherwise', () => {
    expect(effectiveSort(productListQuerySchema.parse({ q: 'earbuds' }))).toBe('relevance');
    expect(effectiveSort(productListQuerySchema.parse({}))).toBe('popular');
    expect(effectiveSort(productListQuerySchema.parse({ sort: 'relevance' }))).toBe('popular');
    expect(effectiveSort(productListQuerySchema.parse({ q: 'x', sort: 'price_asc' }))).toBe('price_asc');
  });

  it('applies defaults and rejects unsafe values', () => {
    expect(productListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 24 });
    expect(productListQuerySchema.safeParse({ sort: 'price; DROP TABLE' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ brand: 'Bad Brand!' }).success).toBe(false);
    expect(productListQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false);
  });
});
