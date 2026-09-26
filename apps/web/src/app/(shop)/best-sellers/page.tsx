import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import type { RawSearchParams } from '@/lib/listing-params';

export const metadata: Metadata = {
  title: 'Best sellers',
  description: 'The most popular products on SeShaKart.',
  alternates: { canonical: '/best-sellers' },
};

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return (
    <>
      <div className="container-page pt-4">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Best sellers' }]} />
      </div>
      <div className="pt-4">
        <ProductListing
          title="Best sellers"
          basePath="/best-sellers"
          searchParams={await searchParams}
          fixed={{ sort: 'popular', inStock: '1' }}
        />
      </div>
    </>
  );
}
