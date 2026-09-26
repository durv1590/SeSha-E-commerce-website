import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import type { RawSearchParams } from '@/lib/listing-params';

export const metadata: Metadata = {
  title: 'Deals',
  description: 'The biggest discounts on SeShaKart right now.',
  alternates: { canonical: '/deals' },
};

export default async function Page({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return (
    <>
      <div className="container-page pt-4">
        <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Deals' }]} />
      </div>
      <div className="pt-4">
        <ProductListing
          title="Deals"
          basePath="/deals"
          searchParams={await searchParams}
          fixed={{ sort: 'discount', discount: '20' }}
        />
      </div>
    </>
  );
}
