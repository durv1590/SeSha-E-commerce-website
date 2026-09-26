import { withSeo } from '@/lib/content/api';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductListing } from '@/components/catalog/ProductListing';
import { getBrand } from '@/lib/catalog';
import type { RawSearchParams } from '@/lib/listing-params';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await getBrand((await params).slug);
  return withSeo(`/brand/${b.slug}`, {
    title: b.metaTitle ?? `${b.name} products`,
    description: b.metaDescription ?? b.description ?? `Shop ${b.name} on SeShaKart.`,
    alternates: { canonical: `/brand/${b.slug}` },
  });
}

export default async function BrandPage({ params, searchParams }: Props) {
  const brand = await getBrand((await params).slug);
  return (
    <>
      <div className="container-page pt-4">
        <Breadcrumbs
          items={[{ name: 'Home', href: '/' }, { name: 'Brands' }, { name: brand.name }]}
        />
      </div>
      <div className="pt-4">
        <ProductListing
          title={brand.name}
          basePath={`/brand/${brand.slug}`}
          searchParams={await searchParams}
          fixed={{ brand: brand.slug }}
          intro={
            brand.description ? (
              <p className="max-w-prose text-text-secondary">{brand.description}</p>
            ) : undefined
          }
        />
      </div>
    </>
  );
}
