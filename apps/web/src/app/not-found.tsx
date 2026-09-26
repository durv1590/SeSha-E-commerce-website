import { EmptyState, buttonVariants } from '@seshakart/ui';
import { Compass, Search } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';

const LINKS = [
  { href: '/categories', label: 'All categories' },
  { href: '/deals', label: 'Deals' },
  { href: '/new-arrivals', label: 'New arrivals' },
  { href: '/track-order', label: 'Track an order' },
];

/**
 * Site-wide 404. Deliberately light (no category menu or live data): Next.js embeds
 * the root not-found boundary in every page's payload, and the full store header
 * duplicated the whole category tree into each page. A plain search form and a few
 * links still get the shopper somewhere useful.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="container-page flex min-h-16 flex-wrap items-center gap-x-6 gap-y-3 py-3">
          <Link href="/" aria-label="SeShaKart home" className="inline-flex">
            <Logo />
          </Link>
          <form
            role="search"
            action="/search"
            method="get"
            aria-label="Products"
            className="flex min-w-0 flex-1 basis-64 items-center gap-2"
          >
            <label htmlFor="nf-q" className="sr-only">
              Search products
            </label>
            <input
              id="nf-q"
              name="q"
              type="search"
              required
              maxLength={100}
              placeholder="Search for products, brands and more"
              className="h-control-md min-w-0 flex-1 rounded-input border border-border-strong bg-surface px-3 text-body focus:border-primary focus:shadow-focus focus:outline-none"
            />
            <button type="submit" className={buttonVariants({ size: 'md' })}>
              <Search size={18} aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Search</span>
            </button>
          </form>
        </div>
      </header>
      <main id="main" className="container-page flex-1 py-section">
        <EmptyState
          icon={<Compass size={28} aria-hidden="true" />}
          headingLevel="h1"
          title="We couldn’t find that page"
          description="The link may be broken or the page may have moved. Try a search, or start from one of these:"
          action={
            <div className="flex flex-col items-center gap-4">
              <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
                {LINKS.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="inline-flex min-h-touch items-center">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/" className={buttonVariants({ variant: 'accent' })}>
                Go to the homepage
              </Link>
            </div>
          }
        />
      </main>
    </div>
  );
}
