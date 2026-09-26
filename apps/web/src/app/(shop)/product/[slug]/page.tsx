import { withSeo } from '@/lib/content/api';
import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { ProductRail } from '@/components/catalog/ProductRail';
import { ProductHero } from '@/components/product/ProductHero';
import { ProductReviews } from '@/components/product/ProductReviews';
import { getProduct, getRelated, getReviews } from '@/lib/catalog';
import { breadcrumbJsonLd, productJsonLd } from '@/lib/seo/json-ld';
import { pageMetadata } from '@/lib/seo/site';
import { JsonLd } from '@/components/seo/JsonLd';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ variant?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  return withSeo(
    `/product/${p.slug}`,
    pageMetadata({
      title: p.metaTitle ?? p.name,
      description: p.metaDescription ?? p.shortDescription,
      // ?variant= links show the same product: one canonical URL.
      path: `/product/${p.slug}`,
      images: p.images
        .slice(0, 4)
        .map((i) => ({ url: i.url, width: i.width, height: i.height, alt: i.alt })),
    }),
  );
}

export default async function ProductPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [product, related, reviews, { variant }] = await Promise.all([
    getProduct(slug),
    getRelated(slug),
    getReviews(slug),
    searchParams,
  ]);
  const paragraphs = product.description.split(/\n{2,}/).filter(Boolean);
  const info = [
    { title: 'Delivery', body: product.shippingInfo },
    { title: 'Returns', body: product.returnInfo },
    { title: 'Warranty', body: product.warrantyInfo },
  ].filter((i) => i.body);

  const crumbs = [
    { name: 'Home', path: '/' },
    ...product.breadcrumbs.map((b) => ({ name: b.name, path: `/category/${b.slug}` })),
    { name: product.name, path: `/product/${product.slug}` },
  ];

  return (
    <>
      <JsonLd data={[productJsonLd(product, reviews), breadcrumbJsonLd(crumbs)]} />
      <div className="container-page flex flex-col gap-4 pt-4">
        <Breadcrumbs
          items={[
            { name: 'Home', href: '/' },
            ...product.breadcrumbs.map((b) => ({ name: b.name, href: `/category/${b.slug}` })),
            { name: product.name },
          ]}
        />
        <ProductHero product={product} initialVariantId={variant} />
      </div>

      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-6 py-section-sm lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-10">
        <div className="flex flex-col gap-8">
          {product.highlights.length > 0 && (
            <section aria-labelledby="highlights">
              <h2 id="highlights" className="mb-3 text-h3">
                Highlights
              </h2>
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
                {product.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-text-secondary">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-primary"
                    />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="description">
            <h2 id="description" className="mb-3 text-h3">
              Description
            </h2>
            <div className="flex max-w-prose flex-col gap-3 text-text-secondary">
              {paragraphs.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>

          {product.specifications.length > 0 && (
            <section aria-labelledby="specifications">
              <h2 id="specifications" className="mb-3 text-h3">
                Specifications
              </h2>
              <table className="w-full overflow-hidden rounded-card border border-border bg-surface text-small">
                <tbody className="divide-y divide-border">
                  {product.specifications.map((s) => (
                    <tr key={s.label}>
                      <th
                        scope="row"
                        className="w-2/5 bg-surface-muted px-4 py-3 text-left font-medium text-text-secondary"
                      >
                        {s.label}
                      </th>
                      <td className="px-4 py-3 text-text-primary">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-labelledby="reviews-heading" id="reviews">
            <h2 id="reviews-heading" className="mb-3 text-h3">
              Ratings &amp; reviews
            </h2>
            <ProductReviews
              slug={product.slug}
              productId={product.id}
              productName={product.name}
              initial={reviews}
            />
          </section>
        </div>

        {info.length > 0 && (
          <aside
            aria-label="Delivery, returns and warranty"
            className="flex flex-col gap-3 lg:pt-12"
          >
            {info.map((i) => (
              <details
                key={i.title}
                className="group rounded-card border border-border bg-surface"
                open
              >
                <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {i.title}
                  <span
                    aria-hidden="true"
                    className="text-text-muted transition-transform group-open:rotate-180"
                  >
                    ▾
                  </span>
                </summary>
                <p className="px-4 pb-4 text-small text-text-secondary">{i.body}</p>
              </details>
            ))}
          </aside>
        )}
      </div>

      <ProductRail
        id="related"
        title="You may also like"
        products={related}
        viewAllHref={`/category/${product.category.slug}`}
      />
    </>
  );
}
