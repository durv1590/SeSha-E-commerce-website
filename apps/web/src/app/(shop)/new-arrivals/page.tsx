import { withSeo } from '@/lib/content/api';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import type { RawSearchParams } from '@/lib/listing-params';

const baseMetadata: Metadata = {
  title: 'New arrivals',
  description: 'The latest products on SeShaKart.',
  alternates: { canonical: '/new-arrivals' },
};

export function generateMetadata(): Promise<Metadata> {
  return withSeo('/new-arrivals', baseMetadata);
}

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return (
    <>
      <div className="container-page pt-4">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'New arrivals' }]} />
      </div>
      <div className="pt-4">
        <ProductListing
          title="New arrivals"
          basePath="/new-arrivals"
          searchParams={await searchParams}
          fixed={{ sort: 'newest' }}
        />
      </div>
    </>
  );
}
