import { withSeo } from '@/lib/content/api';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { getCategoryTree } from '@/lib/catalog';
import { pageMetadata } from '@/lib/seo/site';

const baseMetadata = pageMetadata({
  title: 'All categories',
  description: 'Browse every SeShaKart category.',
  path: '/categories',
});

export function generateMetadata(): Promise<Metadata> {
  return withSeo('/categories', baseMetadata);
}

export default async function CategoriesPage() {
  const tree = await getCategoryTree();
  return (
    <div className="container-page flex flex-col gap-6 py-4 pb-section">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'All categories' }]} />
      <h1 className="text-h1">All categories</h1>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tree.map((root) => (
          <section
            key={root.id}
            aria-labelledby={`cat-${root.slug}`}
            className="rounded-card border border-border bg-surface p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              {root.imageUrl && (
                <Image src={root.imageUrl} alt="" width={48} height={48} className="rounded-md" />
              )}
              <h2 id={`cat-${root.slug}`} className="text-h4">
                <Link
                  href={`/category/${root.slug}`}
                  className="text-text-primary no-underline hover:text-primary"
                >
                  {root.name}
                </Link>
              </h2>
            </div>
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-3 sm:grid-cols-2">
              {root.children.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/category/${child.slug}`}
                    className="text-small font-semibold text-text-primary no-underline hover:text-primary"
                  >
                    {child.name}
                  </Link>
                  {child.children.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {child.children.map((g) => (
                        <li key={g.id}>
                          <Link
                            href={`/category/${g.slug}`}
                            className="inline-flex min-h-6 items-center text-small text-text-secondary no-underline hover:text-primary"
                          >
                            {g.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
