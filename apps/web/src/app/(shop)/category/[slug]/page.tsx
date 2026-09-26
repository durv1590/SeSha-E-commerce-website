import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import { getCategory } from '@/lib/catalog';
import type { RawSearchParams } from '@/lib/listing-params';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await getCategory((await params).slug);
  return {
    title: c.metaTitle ?? `${c.name} — Buy online`,
    description: c.metaDescription ?? c.description ?? `Shop ${c.name} online at SeShaKart.`,
    alternates: { canonical: `/category/${c.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const category = await getCategory(slug);
  return (
    <>
      <div className="container-page pt-4">
        <Breadcrumbs
          items={[
            { name: 'Home', href: '/' },
            ...category.breadcrumbs.map((b) => ({ name: b.name, href: `/category/${b.slug}` })),
          ]}
        />
      </div>
      {category.children.length > 0 && (
        <nav aria-label={`${category.name} sub-categories`} className="container-page pt-4">
          <ul className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
            {category.children.map((c) => (
              <li key={c.id} className="shrink-0">
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex min-h-touch items-center rounded-pill border border-border bg-surface px-4 text-small font-medium text-text-primary no-underline hover:border-primary hover:text-primary"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <div className="pt-4">
        <ProductListing
          title={category.name}
          basePath={`/category/${category.slug}`}
          searchParams={await searchParams}
          fixed={{ category: category.slug }}
          intro={
            category.description ? (
              <p className="max-w-prose text-text-secondary">{category.description}</p>
            ) : undefined
          }
          categoryHref={(s) => `/category/${s}`}
        />
      </div>
      {category.seoContent && (
        <section className="container-page pb-section" aria-label={`About ${category.name}`}>
          <div className="max-w-prose rounded-card border border-border bg-surface p-5 text-small leading-relaxed text-text-secondary">
            {category.seoContent}
          </div>
        </section>
      )}
    </>
  );
}
