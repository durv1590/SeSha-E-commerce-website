import { withSeo } from '@/lib/content/api';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import type { RawSearchParams } from '@/lib/listing-params';
import { listingCanonical, pageMetadata } from '@/lib/seo/site';

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return withSeo(
    '/deals',
    pageMetadata({
      title: 'Deals',
      description: 'The biggest discounts on SeShaKart right now.',
      path: listingCanonical('/deals', await searchParams),
    }),
  );
}

export default async function Page({ searchParams }: Props) {
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
