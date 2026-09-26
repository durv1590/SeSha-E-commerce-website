import type { ReactNode } from 'react';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Providers } from '@/components/Providers';
import { Analytics } from '@/components/analytics/Analytics';

// The header/footer show live, admin-managed data (categories, settings), so shop pages
// render per request. API responses are cached (Next data cache + API Redis), keeping
// this fast, and nothing is ever baked in at build time when the API may be offline.
export const dynamic = 'force-dynamic';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </div>
      <Analytics />
    </Providers>
  );
}
