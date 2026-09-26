import { z } from 'zod';
import { slugSchema } from './primitives';

export const PRODUCT_SORTS = [
  'relevance',
  'popular',
  'newest',
  'price_asc',
  'price_desc',
  'discount',
  'rating',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  relevance: 'Relevance',
  popular: 'Popularity',
  newest: 'Newest first',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  discount: 'Biggest discount',
  rating: 'Customer rating',
};

const csvSlugs = z
  .string()
  .max(500)
  .transform((v) =>
    [
      ...new Set(
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].slice(0, 20),
  )
  .pipe(z.array(slugSchema));

/** Rupees in URLs (human-readable), paise internally. */
const rupees = z.coerce
  .number()
  .int()
  .min(0)
  .max(10_000_000)
  .transform((r) => r * 100);

/**
 * Product listing query, shared by the API and the storefront URLs, e.g.
 * /category/audio?brand=aurora-sound,voltix&min=500&max=5000&sort=price_asc&page=2
 */
export const searchQuerySchema = z.string().trim().min(1).max(100);

export const productListQuerySchema = z.object({
  /** Free-text search; with a query the default sort becomes relevance. */
  q: searchQuerySchema.optional(),
  category: slugSchema.optional(),
  brand: csvSlugs.optional(),
  min: rupees.optional(),
  max: rupees.optional(),
  /** Minimum average rating (1–4). */
  rating: z.coerce.number().int().min(1).max(4).optional(),
  /** Minimum discount percent. */
  discount: z.coerce.number().int().min(0).max(90).optional(),
  inStock: z
    .enum(['true', 'false', '1', '0'])
    .transform((v) => v === 'true' || v === '1')
    .optional(),
  /** Collections used by /deals, /new-arrivals, /best-sellers. */
  featured: z
    .enum(['true', '1'])
    .transform(() => true)
    .optional(),
  sort: z.enum(PRODUCT_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

/** Effective sort: relevance for searches, popularity otherwise. */
export function effectiveSort(q: Pick<ProductListQuery, 'q' | 'sort'>): ProductSort {
  if (q.sort && (q.sort !== 'relevance' || q.q)) return q.sort;
  return q.q ? 'relevance' : 'popular';
}

export const suggestQuerySchema = z.object({ q: z.string().trim().max(100).default('') });
