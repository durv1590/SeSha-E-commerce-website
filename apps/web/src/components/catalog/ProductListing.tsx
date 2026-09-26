import type { ProductFacets } from '@seshakart/types';
import { EmptyState, buttonVariants, cn } from '@seshakart/ui';
import { SearchX, X } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { listProducts } from '@/lib/catalog';
import { listingHref, toListingParams, type RawSearchParams } from '@/lib/listing-params';
import { ProductCard, ProductGrid } from '../cards/ProductCard';
import { FilterForm } from './FilterForm';
import { FilterPanel } from './FilterPanel';
import { MobileFilters } from './MobileFilters';
import { Pagination } from './Pagination';
import { SortSelect } from './SortSelect';
import { toCard } from './toCard';

export interface ProductListingProps {
  title: string;
  /** Page path, e.g. /category/audio. */
  basePath: string;
  searchParams: RawSearchParams;
  /** Params implied by the page itself (category, preset sort…), never shown in its URL. */
  fixed?: Record<string, string>;
  intro?: ReactNode;
  /** Build a sub-category link from a facet value (category pages only). */
  categoryHref?: (slug: string) => string;
  /** Shown instead of the default empty state when nothing matches and no filter is active. */
  empty?: ReactNode;
}

/**
 * Shared product listing used by category, brand, collection and "all products"
 * pages: filters (sidebar on desktop, bottom sheet on mobile), sort, active-filter
 * chips, responsive grid and crawlable pagination. Server-rendered; only the small
 * filter/sort controls hydrate.
 */
export async function ProductListing({
  title,
  basePath,
  searchParams,
  fixed = {},
  intro,
  categoryHref,
  empty,
}: ProductListingProps) {
  const params = toListingParams(searchParams, fixed);
  const { result, meta } = await listProducts(params);
  const fixedKeys = Object.keys(fixed);
  const visible = new URLSearchParams(params);
  fixedKeys.forEach((k) => visible.delete(k));

  const brands = params.get('brand')?.split(',') ?? [];
  const selected = {
    brands,
    min: params.get('min') ?? undefined,
    max: params.get('max') ?? undefined,
    discount: params.get('discount') ?? undefined,
    inStock: params.get('inStock') === '1' || params.get('inStock') === 'true',
  };
  const href = (changes: Record<string, string | null>) =>
    listingHref(basePath, params, changes, fixedKeys);
  const q = params.get('q');
  const defaultSort = fixed.sort ?? (q ? 'relevance' : 'popular');
  const sort = params.get('sort') ?? defaultSort;
  // Form submissions keep the search text and the chosen sort.
  const carry = {
    ...(q ? { q } : {}),
    ...(visible.get('sort') ? { sort: visible.get('sort')! } : {}),
  };
  // "Clear filters" keeps the search itself.
  const clearHref = q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath;

  const chips: { label: string; href: string }[] = [
    ...brands.map((b) => ({
      label: result.facets.brands.find((f) => f.value === b)?.label ?? b,
      href: href({ brand: brands.filter((x) => x !== b).join(',') || null }),
    })),
    ...(selected.min || selected.max
      ? [
          {
            label: `₹${selected.min ?? '0'} – ${selected.max ? `₹${selected.max}` : 'any'}`,
            href: href({ min: null, max: null }),
          },
        ]
      : []),
    ...(selected.discount
      ? [{ label: `${selected.discount}%+ off`, href: href({ discount: null }) }]
      : []),
    ...(selected.inStock ? [{ label: 'In stock', href: href({ inStock: null }) }] : []),
  ];

  const categoryLinks = categoryHref
    ? result.facets.categories.map((c) => ({
        label: c.label,
        count: c.count,
        href: categoryHref(c.value),
      }))
    : undefined;
  const panel = (prefix: string, showApply: boolean) => (
    <FilterPanel
      facets={result.facets as ProductFacets}
      selected={selected}
      categoryLinks={categoryLinks}
      showApply={showApply}
      idPrefix={prefix}
    />
  );
  // A search with no results and no filters: the custom empty state alone, no controls.
  const bare = Boolean(empty) && result.items.length === 0 && chips.length === 0;
  const sortHrefs = Object.fromEntries(
    [...(q ? ['relevance'] : []), 'popular', 'newest', 'price_asc', 'price_desc', 'discount'].map(
      (s) => [s, href({ sort: s === defaultSort ? null : s })],
    ),
  );

  return (
    <div className="container-page pb-section">
      <div
        className={cn(
          'grid grid-cols-[minmax(0,1fr)] gap-8',
          !bare && 'lg:grid-cols-[15rem_minmax(0,1fr)]',
        )}
      >
        <aside aria-label="Filters" className={cn('hidden', !bare && 'lg:block')}>
          <FilterForm id="filters" action={basePath} fixed={carry} autoSubmit>
            {panel('fd', false)}
          </FilterForm>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-col gap-1">
            <h1 className="text-h1">{title}</h1>
            <p className="text-small text-text-muted" aria-live="polite">
              {meta.total.toLocaleString('en-IN')} {meta.total === 1 ? 'product' : 'products'}
            </p>
            {intro}
            {result.correctedQuery && q && (
              <p className="text-body">
                No results for <q className="font-semibold">{q}</q>. Showing results for{' '}
                <q className="font-semibold">{result.correctedQuery}</q> instead.
              </p>
            )}
          </div>

          {/* Sticks just below the sticky header: 9rem with the phone search row, 6.5rem from md. */}
          <div
            className={cn(
              bare ? 'hidden' : 'flex',
              'sticky top-[9rem] z-sticky -mx-gutter mt-4 items-center justify-between gap-3 border-y border-border bg-background/95 px-gutter py-2 backdrop-blur md:top-[6.5rem] lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:backdrop-blur-none',
            )}
          >
            <MobileFilters action={basePath} fixed={carry} activeCount={chips.length}>
              {panel('fm', true)}
            </MobileFilters>
            <div className="ml-auto min-w-0">
              <SortSelect value={sort} hrefFor={sortHrefs} />
            </div>
          </div>

          {chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
              {chips.map((c) => (
                <li key={c.label}>
                  <Link
                    href={c.href}
                    scroll={false}
                    className="inline-flex min-h-8 items-center gap-1 rounded-pill border border-primary/40 bg-primary-light px-3 text-small font-medium text-primary-dark no-underline hover:border-primary"
                  >
                    {c.label}
                    <X size={14} aria-hidden="true" />
                    <span className="sr-only">Remove filter</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href={clearHref} scroll={false} className="text-small font-semibold">
                  Clear all
                </Link>
              </li>
            </ul>
          )}

          {result.items.length === 0 && empty && chips.length === 0 ? (
            empty
          ) : result.items.length === 0 ? (
            <EmptyState
              className="mt-6"
              icon={<SearchX size={28} aria-hidden="true" />}
              title="No products match these filters"
              description="Try removing a filter or widening the price range."
              action={
                <Link href={clearHref} className={buttonVariants({ variant: 'outline' })}>
                  Clear filters
                </Link>
              }
            />
          ) : (
            <ProductGrid className="mt-4 2xl:grid-cols-4 3xl:grid-cols-5">
              {result.items.map((p, i) => (
                <ProductCard key={p.id} product={toCard(p)} priority={i < 4} headingLevel="h2" />
              ))}
            </ProductGrid>
          )}

          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            hrefFor={(p) => href({ page: p === 1 ? null : String(p) })}
          />
        </div>
      </div>
    </div>
  );
}
