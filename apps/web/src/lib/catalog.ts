import 'server-only';
import type {
  BrandDto,
  CategoryDetail,
  CategoryNode,
  HomePageDto,
  PaginationMeta,
  PopularSearches,
  ProductDetail,
  ProductListResult,
  ProductSummary,
} from '@seshakart/types';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ApiError } from './api/errors';
import { serverApi } from './api/server';

/**
 * Public catalogue reads. Cached in the Next.js data cache (tag "catalog") on top of
 * the API's Redis cache, so repeat views never hit the database.
 */
const pub = { auth: false, revalidate: 60, tags: ['catalog'] } as const;

async function orNotFound<T>(p: Promise<{ data: T }>): Promise<T> {
  try {
    return (await p).data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export const getHome = cache(() => serverApi<HomePageDto>('/home', pub).then((r) => r.data));

export const getCategoryTree = cache(async (): Promise<CategoryNode[]> => {
  if (process.env.NEXT_PHASE === 'phase-production-build') return [];
  try {
    return (await serverApi<CategoryNode[]>('/categories', { ...pub, revalidate: 300 })).data;
  } catch {
    return []; // the header must render even if the API is briefly unavailable
  }
});

export const getCategory = cache((slug: string) =>
  orNotFound(serverApi<CategoryDetail>(`/categories/${slug}`, pub)),
);
export const getBrand = cache((slug: string) =>
  orNotFound(serverApi<BrandDto>(`/brands/${slug}`, pub)),
);
export const getBrands = cache(() => serverApi<BrandDto[]>('/brands', pub).then((r) => r.data));
export const getProduct = cache((slug: string) =>
  orNotFound(serverApi<ProductDetail>(`/products/${slug}`, pub)),
);
export const getRelated = cache((slug: string) =>
  serverApi<ProductSummary[]>(`/products/${slug}/related`, pub).then(
    (r) => r.data,
    () => [],
  ),
);

export async function listProducts(
  params: URLSearchParams,
): Promise<{ result: ProductListResult; meta: PaginationMeta }> {
  const res = await orNotFound(
    serverApi<ProductListResult>(`/products?${params.toString()}`, pub).then((r) => ({ data: r })),
  );
  return { result: res.data, meta: res.meta! };
}

export const getPopularSearches = cache(() =>
  serverApi<PopularSearches>('/search/popular', { ...pub, revalidate: 300 }).then(
    (r) => r.data,
    (): PopularSearches => ({ trending: [], popular: [] }),
  ),
);
