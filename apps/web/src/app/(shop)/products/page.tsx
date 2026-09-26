import { withSeo } from '@/lib/content/api';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import type { RawSearchParams } from '@/lib/listing-params';
import { listingCanonical, pageMetadata } from '@/lib/seo/site';

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return withSeo(
    '/products',
    pageMetadata({
      title: 'All products',
      description: 'Browse the full SeShaKart catalogue.',
      path: listingCanonical('/products', await searchParams),
    }),
  );
}

export default async function Page({ searchParams }: Props) {
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
