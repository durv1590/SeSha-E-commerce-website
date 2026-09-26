import { formatINR } from '@seshakart/ui';
import Link from 'next/link';
import { getPublicSettings } from '@/lib/settings/public';
import { Logo } from '../brand/Logo';
import { AccountMenu } from './AccountMenu';
import { MobileMenu } from './MobileMenu';

/**
 * Site header. Server component; only the account menu and mobile drawer hydrate.
 * Search, category navigation, wishlist and cart are added by their phases.
 */
export async function SiteHeader() {
  const settings = await getPublicSettings();
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
        <MobileMenu />
        <Link href="/" className="shrink-0 rounded-sm" aria-label={`${settings.storeName} home`}>
          <Logo height={36} priority className="hidden sm:block" />
          <Logo variant="icon" height={36} priority className="sm:hidden" />
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden sm:block">
            <AccountMenu />
          </div>
          <div className="sm:hidden">
            <AccountMenu compact />
          </div>
        </div>
      </div>
    </header>
  );
}
