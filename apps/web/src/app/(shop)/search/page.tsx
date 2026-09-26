import { EmptyState } from '@seshakart/ui';
import { SearchX } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import { getCategoryTree, getPopularSearches } from '@/lib/catalog';
import type { RawSearchParams } from '@/lib/listing-params';

type Props = { searchParams: Promise<RawSearchParams> };

/** The search text from the URL: first value, trimmed, capped like the API. */
function queryOf(raw: RawSearchParams): string {
  const v = raw.q;
  return (Array.isArray(v) ? v[0] : v)?.trim().replace(/\s+/g, ' ').slice(0, 100) ?? '';
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = queryOf(await searchParams);
  return {
    title: q ? `Search results for “${q}”` : 'Search',
    // Result pages are endless and thin: keep them out of the index, but let
    // crawlers follow through to the products.
    robots: { index: false, follow: true },
  };
}

function Suggestions({
  heading,
  terms,
  categories,
}: {
  heading: string;
  terms: string[];
  categories: { name: string; slug: string }[];
}) {
  const chip =
    'inline-flex min-h-11 items-center rounded-pill border border-border-strong bg-surface px-4 text-small font-medium text-text-primary no-underline hover:border-primary hover:text-primary';
  return (
    <div className="flex flex-col gap-6">
      {terms.length > 0 && (
        <section aria-labelledby="popular-searches">
          <h2 id="popular-searches" className="text-h3">
            {heading}
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {terms.map((t) => (
              <li key={t}>
                <Link href={`/search?q=${encodeURIComponent(t)}`} className={chip}>
                  {t}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {categories.length > 0 && (
        <section aria-labelledby="browse-categories">
          <h2 id="browse-categories" className="text-h3">
            Browse categories
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/category/${c.slug}`} className={chip}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default async function Page({ searchParams }: Props) {
  const raw = await searchParams;
  const q = queryOf(raw);
  const [popular, tree] = await Promise.all([getPopularSearches(), getCategoryTree()]);
  const terms = [...new Set([...popular.trending, ...popular.popular])].slice(0, 12);
  const categories = tree.map((c) => ({ name: c.name, slug: c.slug }));

  if (!q) {
    return (
      <div className="container-page pb-section pt-4">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Search' }]} />
        <h1 className="mt-4 text-h1">Search</h1>
        <p className="mt-1 text-body text-text-secondary">
          Use the search bar above to find products, brands and categories.
        </p>
        <div className="mt-8">
          <Suggestions heading="Popular searches" terms={terms} categories={categories} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="container-page pt-4">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Search' }]} />
      </div>
      <div className="pt-4">
        <ProductListing
          title={`Results for “${q}”`}
          basePath="/search"
          searchParams={{ ...raw, q }}
          empty={
            <div className="mt-6 flex flex-col gap-8">
              <EmptyState
                icon={<SearchX size={28} aria-hidden="true" />}
                title={`No results for “${q}”`}
                description="Check the spelling, use fewer or more general words, or browse a category."
              />
              <Suggestions heading="Try a popular search" terms={terms} categories={categories} />
            </div>
          }
        />
      </div>
    </>
  );
}
