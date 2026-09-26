import { withSeo } from '@/lib/content/api';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import type { RawSearchParams } from '@/lib/listing-params';

const baseMetadata: Metadata = {
  title: 'All products',
  description: 'Browse the full SeShaKart catalogue.',
  alternates: { canonical: '/products' },
};

export function generateMetadata(): Promise<Metadata> {
  return withSeo('/products', baseMetadata);
}

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return (
    <>
      <div className="container-page pt-4">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'All products' }]} />
      </div>
      <div className="pt-4">
        <ProductListing
          title="All products"
          basePath="/products"
          searchParams={await searchParams}
          fixed={{}}
        />
      </div>
    </>
  );
}
