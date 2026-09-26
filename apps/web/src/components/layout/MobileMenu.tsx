'use client';

import { Drawer } from '@seshakart/ui';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/account', label: 'My account' },
  { href: '/account/addresses', label: 'Saved addresses' },
  { href: '/account/notifications', label: 'Notifications' },
];

/** Mobile navigation drawer (left side sheet). Closes on navigation. */
export function MobileMenu() {
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
        <nav aria-label="Mobile">
          <ul className="-mx-2 flex flex-col">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={pathname === l.href ? 'page' : undefined}
                  className="flex min-h-touch items-center rounded-md px-3 text-body font-medium text-text-primary no-underline hover:bg-surface-muted aria-[current=page]:bg-primary-light aria-[current=page]:text-primary-dark"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Drawer>
    </>
  );
}
