'use client';

import { cn } from '@seshakart/ui';
import { Bell, LayoutDashboard, LogOut, MapPin, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api/browser';

// Orders, wishlist and reviews join this list in their phases.
const ITEMS = [
  { href: '/account', label: 'Overview', icon: LayoutDashboard },
  { href: '/account/profile', label: 'Profile', icon: UserRound },
  { href: '/account/addresses', label: 'Addresses', icon: MapPin },
  { href: '/account/security', label: 'Security', icon: ShieldCheck },
  { href: '/account/notifications', label: 'Notifications', icon: Bell },
];

/** Sidebar on desktop, horizontally scrollable pill row on mobile. */
export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();
  const link =
    'flex min-h-touch shrink-0 items-center gap-2.5 rounded-button px-3 text-small font-medium no-underline transition-colors';

  return (
    <nav
      aria-label="Account"
      className="-mx-gutter overflow-x-auto px-gutter lg:mx-0 lg:overflow-visible lg:px-0"
    >
      <ul className="flex gap-2 pb-1 lg:flex-col lg:gap-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  link,
                  'border border-border bg-surface text-text-secondary hover:text-primary lg:border-transparent lg:bg-transparent',
                  active &&
                    'border-primary bg-primary-light text-primary-dark lg:border-transparent lg:bg-primary-light',
                )}
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
        <li className="lg:mt-2 lg:border-t lg:border-border lg:pt-2">
          <button
            type="button"
            onClick={async () => {
              await api.post('/auth/logout').catch(() => undefined);
              router.push('/');
              router.refresh();
            }}
            className={cn(
              link,
              'w-full border border-border bg-surface text-error-text hover:bg-error-light lg:border-transparent lg:bg-transparent',
            )}
          >
            <LogOut size={18} aria-hidden="true" />
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}
