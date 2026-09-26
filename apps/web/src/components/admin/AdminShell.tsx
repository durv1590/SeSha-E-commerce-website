'use client';

import type { MeDto } from '@seshakart/types';
import { Drawer, cn } from '@seshakart/ui';
import {
  BarChart3,
  ClipboardList,
  ExternalLink,
  FileText,
  FolderTree,
  Gauge,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Package,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  TicketPercent,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api } from '@/lib/api/browser';
import { Logo } from '../brand/Logo';
import { navFor } from './nav';

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ClipboardList,
  returns: RotateCcw,
  products: Package,
  categories: FolderTree,
  brands: Tag,
  inventory: Warehouse,
  customers: Users,
  coupons: TicketPercent,
  reviews: MessageSquareText,
  content: ImageIcon,
  pages: FileText,
  seo: Search,
  reports: BarChart3,
  settings: Settings,
  staff: ShieldCheck,
  audit: Gauge,
};

function Nav({ user, onNavigate }: { user: MeDto; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {navFor(user.permissions).map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
            {g.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const Icon = ICONS[i.icon] ?? LayoutDashboard;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={onNavigate}
                    aria-current={active(i.href) ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 items-center gap-3 rounded-md px-3 text-small font-medium no-underline',
                      active(i.href)
                        ? 'bg-primary-light text-primary-dark'
                        : 'text-text-primary hover:bg-surface-muted',
                    )}
                  >
                    <Icon size={18} aria-hidden="true" />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Admin chrome: sidebar navigation (a drawer below 1024px), a top bar with a link to
 * the store and the staff member's name, and the page content.
 */
export function AdminShell({ user, children }: { user: MeDto; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const signOut = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    router.push('/');
    router.refresh();
  };
  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-tooltip focus:rounded-button focus:bg-navy focus:px-4 focus:py-2 focus:text-text-inverse"
      >
        Skip to content
      </a>
      <aside
        aria-label="Admin sidebar"
        className="sticky top-0 hidden h-dvh flex-col gap-6 overflow-y-auto border-r border-border bg-surface p-4 lg:flex"
      >
        <Link href="/admin" className="rounded-sm px-2 py-1" aria-label="SeShaKart admin home">
          <Logo height={32} />
        </Link>
        <Nav user={user} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-header flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-gutter backdrop-blur lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid size-10 place-items-center rounded-md hover:bg-surface-muted lg:hidden"
            aria-label="Open admin menu"
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <span className="font-heading text-h5 lg:hidden">Admin</span>
          <div className="ml-auto flex items-center gap-2 text-small">
            <Link
              href="/"
              target="_blank"
              className="hidden items-center gap-1 font-semibold sm:inline-flex"
            >
              View store <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </Link>
            <span className="hidden text-text-muted md:inline" aria-hidden="true">
              ·
            </span>
            <span className="hidden max-w-40 truncate md:inline">
              {user.name}{' '}
              <span className="text-text-muted">
                ({user.role.replace(/_/g, ' ').toLowerCase()})
              </span>
            </span>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 font-semibold text-text-secondary hover:bg-surface-muted"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </header>
        <main id="admin-main" className="min-w-0 flex-1 px-gutter py-6 lg:px-8">
          {children}
        </main>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} side="left" title="Admin menu">
        <Nav user={user} onNavigate={() => setOpen(false)} />
      </Drawer>
    </div>
  );
}
