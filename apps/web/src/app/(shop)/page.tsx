import type { Metadata } from 'next';
import { BrandIcon, type BrandIconName } from '@/components/brand/BrandIcon';
import { BrandCard } from '@/components/cards/BrandCard';
import { CategoryCard } from '@/components/cards/CategoryCard';
import { OfferCard } from '@/components/cards/OfferCard';
import { ProductRail } from '@/components/catalog/ProductRail';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { getHome } from '@/lib/catalog';

export const metadata: Metadata = {
  title: { absolute: 'SeShaKart — Smart Shopping, Better Living' },
  description:
    'Shop electronics, fashion, home & kitchen, beauty and more on SeShaKart. Genuine products, secure payments and fast delivery across India.',
  alternates: { canonical: '/' },
};

// Rendered per request (never baked in at build time, when the API may be unreachable);
// the API responses themselves are cached for 60 s, so this stays fast.
export const dynamic = 'force-dynamic';

const BENEFITS: { icon: BrandIconName; title: string; text: string }[] = [
  {
    icon: 'genuine',
    title: 'Genuine products',
    text: 'Sourced from brands and authorised sellers',
  },
  { icon: 'convenience', title: 'Fast delivery', text: 'Quick, trackable shipping across India' },
  { icon: 'trust', title: 'Secure payments', text: 'UPI, cards, net banking and COD' },
  { icon: 'returns', title: 'Easy returns', text: 'Hassle-free returns on eligible items' },
];

const OFFER_THEME = { PRIMARY: 'primary', NAVY: 'navy', ACCENT: 'accent', LIGHT: 'light' } as const;

export default async function HomePage() {
  const home = await getHome().catch(() => null);
  if (!home) {
    return (
      <div className="container-page py-section text-center">
        <h1 className="text-h2">SeShaKart is taking a short break</h1>
        <p className="mt-2 text-text-muted">Please try again in a moment.</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="sr-only">SeShaKart — Smart Shopping, Better Living</h1>

      {home.heroBanners.length > 0 && (
        <section className="container-page pt-4 md:pt-6" aria-label="Offers">
          <HeroCarousel
            labels={home.heroBanners.map((b) => b.title)}
            slides={home.heroBanners.map((b, i) => (
              <HeroBanner key={b.id} banner={b} priority={i === 0} />
            ))}
          />
        </section>
      )}

      {home.featuredCategories.length > 0 && (
        <section aria-labelledby="home-categories" className="container-page py-section-sm">
          <SectionHeading
            id="home-categories"
            title="Shop by category"
            viewAllHref="/categories"
            viewAllLabel="All categories"
          />
          <ul className="grid grid-cols-3 gap-2 xs:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
            {home.featuredCategories.slice(0, 12).map((c) => (
              <li key={c.id}>
                <CategoryCard
                  name={c.name}
                  href={`/category/${c.slug}`}
                  image={c.imageUrl ? { url: c.imageUrl } : null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {home.promoBanners.length > 0 && (
        <section aria-label="Promotions" className="container-page py-section-sm">
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-3">
            {home.promoBanners.map((b) => (
              <li key={b.id}>
                <OfferCard
                  title={b.title}
                  subtitle={b.subtitle ?? undefined}
                  href={b.link ?? '/products'}
                  ctaLabel={b.ctaLabel ?? 'Shop now'}
                  theme={OFFER_THEME[b.theme]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {home.sections.map((s) => (
        <ProductRail
          key={s.id}
          id={`home-${s.id}`}
          title={s.title}
          subtitle={s.subtitle}
          viewAllHref={s.viewAllHref}
          products={s.products}
        />
      ))}

      <section aria-label="Why shop with SeShaKart" className="container-page py-section-sm">
        <ul className="grid grid-cols-2 gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-4 md:gap-4 md:p-6">
          {BENEFITS.map((b) => (
            <li
              key={b.title}
              className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary-light text-primary">
                <BrandIcon name={b.icon} />
              </span>
              <div>
                <p className="text-small font-semibold text-text-primary">{b.title}</p>
                <p className="text-caption text-text-muted">{b.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {home.featuredBrands.length > 0 && (
        <section aria-labelledby="home-brands" className="container-page py-section-sm">
          <SectionHeading id="home-brands" title="Brands you’ll love" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {home.featuredBrands.map((b) => (
              <li key={b.id}>
                <BrandCard
                  name={b.name}
                  href={`/brand/${b.slug}`}
                  logo={b.logoUrl ? { url: b.logoUrl } : null}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
