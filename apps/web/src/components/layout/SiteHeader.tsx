import { formatINR } from '@seshakart/ui';
import Link from 'next/link';
import { Suspense } from 'react';
import { getCategoryTree } from '@/lib/catalog';
import { getPublicSettings } from '@/lib/settings/public';
import { Logo } from '../brand/Logo';
import { CartLink, WishlistLink } from '../cart/HeaderCartLinks';
import { SearchBox, SearchBoxFallback } from '../search/SearchBox';
import { AccountMenu } from './AccountMenu';
import { CategoryNav } from './CategoryNav';
import { MobileMenu } from './MobileMenu';

/**
 * Site header. Server component; only the account menu and mobile drawer hydrate.
 * Search sits in the main bar from 768 px and in its own full-width row below it on
 * phones. Phones keep the header to menu, logo, account and cart; the wishlist is in
 * the menu drawer there.
 */
export async function SiteHeader() {
  const [settings, tree] = await Promise.all([getPublicSettings(), getCategoryTree()]);
  return (
    <header className="sticky top-0 z-header bg-surface shadow-xs">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-tooltip focus:rounded-button focus:bg-navy focus:px-4 focus:py-2 focus:text-text-inverse"
      >
        Skip to content
      </a>
      <div className="bg-navy text-text-inverse">
        <p className="container-page py-1.5 text-center text-caption md:text-small">
          Free delivery on orders above{' '}
          <strong className="text-accent">{formatINR(settings.freeShippingThreshold)}</strong>
          <span className="hidden sm:inline"> · {settings.tagline}</span>
        </p>
      </div>
      <div className="container-page flex h-16 items-center gap-2 md:h-[4.5rem]">
        <MobileMenu
          tree={tree.map((r) => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            children: r.children.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
          }))}
        />
        <Link href="/" className="shrink-0 rounded-sm" aria-label={`${settings.storeName} home`}>
          <Logo height={36} priority className="hidden sm:block" />
          <Logo variant="icon" height={36} priority className="sm:hidden" />
        </Link>
        <div className="mx-2 hidden min-w-0 max-w-2xl flex-1 md:block lg:mx-6">
          <Suspense fallback={<SearchBoxFallback />}>
            <SearchBox />
          </Suspense>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden sm:block">
            <AccountMenu />
          </div>
          <div className="sm:hidden">
            <AccountMenu compact />
          </div>
          <div className="hidden sm:block">
            <WishlistLink />
          </div>
          <CartLink />
        </div>
      </div>
      <div className="container-page pb-2 md:hidden">
        <Suspense fallback={<SearchBoxFallback />}>
          <SearchBox />
        </Suspense>
      </div>
      <CategoryNav tree={tree} />
    </header>
  );
}
