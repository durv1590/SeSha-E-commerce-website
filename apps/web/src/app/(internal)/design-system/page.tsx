import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Alert,
  Badge,
  BestSellerBadge,
  buttonVariants,
  Card,
  colors,
  DealBadge,
  DiscountBadge,
  EmptyState,
  NewBadge,
  Price,
  Rating,
  Skeleton,
  StockBadge,
} from '@seshakart/ui';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { BRAND_ICONS, BrandIcon, type BrandIconName } from '@/components/brand/BrandIcon';
import { Logo } from '@/components/brand/Logo';
import { BrandCard } from '@/components/cards/BrandCard';
import { CategoryCard } from '@/components/cards/CategoryCard';
import { OfferCard } from '@/components/cards/OfferCard';
import {
  ProductCard,
  ProductCardSkeleton,
  ProductGrid,
  type ProductCardData,
} from '@/components/cards/ProductCard';
import { SectionHeading } from '@/components/layout/SectionHeading';
import { AddToCartDemo, InteractiveDemos, WishlistDemo } from './demos';

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
};

// Internal reference page for designers, developers and QA. Disabled in production
// unless explicitly enabled (e.g. on a staging deployment).
const enabled =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_DESIGN_SYSTEM_PAGE === 'true';

// Illustrative values for component states only — not real products or reviews.
const SAMPLE_PRODUCTS: ProductCardData[] = [
  {
    slug: 'sample-wireless-earbuds',
    name: 'Sample Wireless Earbuds with Active Noise Cancellation',
    brandName: 'Sample Brand',
    image: null,
    mrp: 499900,
    price: 199900,
    ratingAvg: 4.3,
    ratingCount: 1250,
    stock: 'in_stock',
    badges: ['DEAL'],
  },
  {
    slug: 'sample-smartwatch',
    name: 'Sample Smartwatch, 1.8" AMOLED',
    brandName: 'Sample Brand',
    image: null,
    mrp: 699900,
    price: 549900,
    ratingAvg: 4.0,
    ratingCount: 86,
    stock: 'low_stock',
    available: 3,
    badges: ['NEW'],
  },
  {
    slug: 'sample-running-shoes',
    name: 'Sample Running Shoes — Lightweight Mesh',
    brandName: null,
    image: null,
    mrp: 299900,
    price: 299900,
    ratingAvg: 0,
    ratingCount: 0,
    stock: 'in_stock',
    badges: ['BESTSELLER'],
  },
  {
    slug: 'sample-backpack',
    name: 'Sample Laptop Backpack 30L',
    brandName: 'Sample Brand',
    image: null,
    mrp: 249900,
    price: 129900,
    ratingAvg: 4.6,
    ratingCount: 342000,
    stock: 'out_of_stock',
  },
];

const COLOR_GROUPS: { title: string; names: (keyof typeof colors)[] }[] = [
  {
    title: 'Brand',
    names: [
      'primary',
      'primary-dark',
      'primary-light',
      'accent',
      'accent-dark',
      'accent-text',
      'accent-light',
      'navy',
      'navy-light',
    ],
  },
  {
    title: 'Feedback',
    names: [
      'success',
      'success-text',
      'success-light',
      'warning',
      'warning-text',
      'warning-light',
      'error',
      'error-text',
      'error-light',
    ],
  },
  {
    title: 'Neutrals',
    names: [
      'background',
      'surface',
      'surface-muted',
      'border',
      'border-strong',
      'text-primary',
      'text-secondary',
      'text-muted',
    ],
  },
];

const TYPE_SCALE = [
  ['text-display', 'Display', 'Smart Shopping, Better Living'],
  ['text-h1', 'H1', 'Everything you need in one place'],
  ['text-h2', 'H2', 'Best sellers this week'],
  ['text-h3', 'H3', 'Electronics & accessories'],
  ['text-h4', 'H4', 'Delivery & returns'],
  ['text-h5', 'H5', 'Order summary'],
  ['text-body', 'Body', 'Genuine products, secure payments and fast delivery across India.'],
  ['text-small', 'Small', 'Inclusive of all taxes. Free delivery on orders above ₹499.'],
  ['text-caption', 'Caption', 'Sold by SeShaKart Pvt. Ltd.'],
  ['text-nav', 'Navigation', 'Electronics  Fashion  Home & Living'],
  ['text-product-title', 'Product title', 'Wireless Earbuds with Active Noise Cancellation'],
  ['text-price', 'Price', '₹1,999'],
  ['text-discount text-success-text', 'Discount', '60% off'],
] as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="border-t border-border py-section-sm">
      <h2 id={id} className="mb-5 text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  if (!enabled) notFound();

  return (
    <>
      <header className="bg-navy">
        <div className="container-page flex flex-wrap items-center justify-between gap-4 py-5">
          <Logo tone="reversed" height={40} priority />
          <p className="text-small text-text-inverse/80">
            Design system · v0.2 · internal reference
          </p>
        </div>
      </header>

      <main className="container-page pb-section">
        <div className="py-section-sm">
          <h1 className="text-h1">SeShaKart design system</h1>
          <p className="mt-2 max-w-prose text-text-secondary">
            Every value on this page comes from <code>packages/ui/src/tokens.ts</code>. Usage rules
            live in <code>docs/BRAND_DESIGN_SYSTEM.md</code>. Product data shown here is
            illustrative.
          </p>
        </div>

        <Section id="logo" title="Logo">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="grid place-items-center gap-6 py-10">
              <Logo height={48} />
              <Logo variant="stacked" height={120} />
            </Card>
            <Card className="grid place-items-center gap-6 border-navy bg-navy py-10">
              <Logo tone="reversed" height={48} />
              <Logo variant="stacked" tone="reversed" height={120} />
            </Card>
          </div>
          <Alert variant="warning" title="Provisional logo" className="mt-4">
            Cropped from the brand board (concept 01 “Smart S”). Replace with the master SVG — see
            brand/README.md.
          </Alert>
        </Section>

        <Section id="colors" title="Colour tokens">
          <div className="flex flex-col gap-6">
            {COLOR_GROUPS.map((g) => (
              <div key={g.title}>
                <h3 className="mb-3 text-h5">{g.title}</h3>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
                  {g.names.map((n) => (
                    <li
                      key={n}
                      className="overflow-hidden rounded-md border border-border bg-surface"
                    >
                      <div
                        className="h-14 border-b border-border"
                        style={{ background: colors[n] }}
                      />
                      <div className="p-2">
                        <p className="truncate text-caption font-semibold">{n}</p>
                        <p className="text-caption uppercase text-text-muted">{colors[n]}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="type" title="Typography">
          <p className="mb-4 text-small text-text-muted">
            Headings: Montserrat · UI &amp; body: Inter. Heading sizes are fluid from 320px to
            2560px.
          </p>
          <dl className="divide-y divide-border rounded-card border border-border bg-surface">
            {TYPE_SCALE.map(([cls, label, sample]) => (
              <div
                key={label}
                className="grid gap-1 p-4 md:grid-cols-[10rem_1fr] md:items-baseline"
              >
                <dt className="text-caption font-semibold uppercase text-text-muted">{label}</dt>
                <dd
                  className={`${cls} ${cls.includes('display') || /text-h\d/.test(cls) ? 'font-heading' : ''} min-w-0 break-words`}
                >
                  {sample}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="icons" title="Brand icons">
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
            {(Object.keys(BRAND_ICONS) as BrandIconName[]).map((name) => (
              <li
                key={name}
                className="flex flex-col items-center gap-2 rounded-card border border-border bg-surface p-4 text-center"
              >
                <BrandIcon name={name} className="text-primary" />
                <span className="text-caption capitalize text-text-secondary">
                  {name.replace('-', ' ')}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="buttons" title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="#buttons" className={buttonVariants({ variant: 'primary' })}>
              Primary
            </Link>
            <Link href="#buttons" className={buttonVariants({ variant: 'accent' })}>
              <ShoppingCart size={18} aria-hidden="true" /> Accent CTA
            </Link>
            <Link href="#buttons" className={buttonVariants({ variant: 'secondary' })}>
              Secondary
            </Link>
            <Link href="#buttons" className={buttonVariants({ variant: 'outline' })}>
              Outline
            </Link>
            <Link href="#buttons" className={buttonVariants({ variant: 'ghost' })}>
              Ghost
            </Link>
            <Link href="#buttons" className={buttonVariants({ variant: 'danger' })}>
              Danger
            </Link>
            <Link href="#buttons" className={buttonVariants({ variant: 'link' })}>
              Link
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="#buttons" className={buttonVariants({ size: 'sm' })}>
              Small
            </Link>
            <Link href="#buttons" className={buttonVariants({ size: 'md' })}>
              Medium (44px)
            </Link>
            <Link href="#buttons" className={buttonVariants({ size: 'lg' })}>
              Large
            </Link>
          </div>
        </Section>

        <Section id="badges" title="Badges, price &amp; rating">
          <div className="flex flex-wrap items-center gap-2">
            <DiscountBadge percent={40} />
            <DealBadge />
            <NewBadge />
            <BestSellerBadge />
            <StockBadge state="in_stock" />
            <StockBadge state="low_stock" available={2} />
            <StockBadge state="out_of_stock" />
            <Badge variant="info">Free delivery</Badge>
            <Badge>Neutral</Badge>
          </div>
          <div className="mt-6 flex flex-wrap items-start gap-10">
            <Price price={199900} mrp={499900} />
            <Price price={124999900} mrp={139999900} size="lg" showSavings />
            <Rating value={4.3} count={1250} />
            <Rating value={3.5} count={12} size="md" />
          </div>
        </Section>

        <Section id="product-cards" title="Product cards">
          <ProductGrid>
            {SAMPLE_PRODUCTS.map((p) => (
              <ProductCard
                key={p.slug}
                product={p}
                wishlist={<WishlistDemo name={p.name} />}
                action={<AddToCartDemo name={p.name} disabled={p.stock === 'out_of_stock'} />}
              />
            ))}
            <ProductCardSkeleton />
          </ProductGrid>
        </Section>

        <Section id="cards" title="Category, offer &amp; brand cards">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {[
              'Electronics',
              'Fashion',
              'Home & Living',
              'Beauty',
              'Grocery',
              'Sports',
              'Toys',
              'Books',
            ].map((c) => (
              <CategoryCard key={c} name={c} href="#cards" />
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OfferCard
              title="Big savings every day"
              subtitle="Top picks under ₹999"
              href="#cards"
              theme="primary"
            />
            <OfferCard
              title="New arrivals"
              subtitle="Fresh styles this week"
              href="#cards"
              theme="navy"
            />
            <OfferCard
              title="Deal of the day"
              subtitle="Limited-time prices"
              href="#cards"
              theme="accent"
            />
            <OfferCard
              title="Smart home"
              subtitle="Upgrade your living"
              href="#cards"
              theme="light"
            />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {['Brand One', 'Brand Two', 'Brand Three', 'Brand Four'].map((b) => (
              <BrandCard key={b} name={b} href="#cards" />
            ))}
          </div>
        </Section>

        <Section id="sections" title="Section heading">
          <SectionHeading
            title="Best sellers"
            subtitle="Most loved by SeShaKart shoppers"
            viewAllHref="#sections"
          />
        </Section>

        <Section id="feedback" title="Alerts, empty &amp; loading states">
          <div className="grid gap-3 md:grid-cols-2">
            <Alert variant="info" title="Delivery update">
              Orders placed before 2 PM ship today.
            </Alert>
            <Alert variant="success" title="Coupon applied">
              You saved ₹200 with SMART200.
            </Alert>
            <Alert variant="warning" title="Only 2 left">
              Complete checkout soon to secure your item.
            </Alert>
            <Alert variant="error" title="Payment failed">
              Your bank declined the payment. No money was deducted.
            </Alert>
          </div>
          <Card className="mt-4">
            <EmptyState
              icon={<ShoppingCart size={28} aria-hidden="true" />}
              title="Your cart is empty"
              description="Explore today’s deals and find something you’ll love."
              action={
                <Link href="#feedback" className={buttonVariants({ variant: 'accent' })}>
                  Continue shopping
                </Link>
              }
            />
          </Card>
          <div className="mt-4 flex items-center gap-4">
            <Skeleton className="size-16 rounded-pill" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </Section>

        <Section id="interactive" title="Forms &amp; interactive components">
          <InteractiveDemos />
        </Section>
      </main>
    </>
  );
}
