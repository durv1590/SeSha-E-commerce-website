'use client';

import type { CategoryNode } from '@seshakart/types';
import { Drawer } from '@seshakart/ui';
import { ChevronDown, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const QUICK = [
  { href: '/deals', label: 'Deals' },
  { href: '/new-arrivals', label: 'New arrivals' },
  { href: '/best-sellers', label: 'Best sellers' },
  { href: '/categories', label: 'All categories' },
];

const ACCOUNT = [
  { href: '/account', label: 'My account' },
  { href: '/account/wishlist', label: 'Wishlist' },
  { href: '/cart', label: 'Cart' },
  { href: '/account/addresses', label: 'Saved addresses' },
  { href: '/account/notifications', label: 'Notifications' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/track-order', label: 'Track an order' },
];

const itemClass =
  'flex min-h-touch items-center rounded-md px-3 text-body font-medium text-text-primary no-underline hover:bg-surface-muted aria-[current=page]:bg-primary-light aria-[current=page]:text-primary-dark';

/** Mobile navigation drawer: quick links, category tree (disclosure widgets), account. */
export function MobileMenu({ tree }: { tree: CategoryNode[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-haspopup="dialog"
        className="grid size-control-md place-items-center rounded-button text-text-primary hover:bg-surface-muted lg:hidden"
      >
        <Menu size={24} aria-hidden="true" />
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Menu">
        <nav aria-label="Mobile" className="-mx-2 flex flex-col gap-4">
          <ul className="flex flex-col">
            <li>
              <Link
                href="/"
                aria-current={pathname === '/' ? 'page' : undefined}
                className={itemClass}
              >
                Home
              </Link>
            </li>
            {QUICK.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={pathname === l.href ? 'page' : undefined}
                  className={itemClass}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          {tree.length > 0 && (
            <div>
              <p className="px-3 pb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
                Categories
              </p>
              <ul className="flex flex-col">
                {tree.map((root) => (
                  <li key={root.id}>
                    <details className="group">
                      <summary
                        className={`${itemClass} cursor-pointer list-none justify-between [&::-webkit-details-marker]:hidden`}
                      >
                        {root.name}
                        <ChevronDown
                          size={18}
                          aria-hidden="true"
                          className="text-text-muted transition-transform group-open:rotate-180"
                        />
                      </summary>
                      <ul className="mb-2 ml-3 flex flex-col border-l border-border pl-2">
                        <li>
                          <Link
                            href={`/category/${root.slug}`}
                            className={`${itemClass} text-small`}
                          >
                            All {root.name}
                          </Link>
                        </li>
                        {root.children.map((c) => (
                          <li key={c.id}>
                            <Link
                              href={`/category/${c.slug}`}
                              aria-current={pathname === `/category/${c.slug}` ? 'page' : undefined}
                              className={`${itemClass} text-small`}
                            >
                              {c.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="px-3 pb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
              Your account
            </p>
            <ul className="flex flex-col">
              {ACCOUNT.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    aria-current={pathname === l.href ? 'page' : undefined}
                    className={itemClass}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </Drawer>
    </>
  );
}
