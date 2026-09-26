import { EmptyState, buttonVariants } from '@seshakart/ui';
import { Compass } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Providers } from '@/components/Providers';

/** Site-wide 404 for URLs that match no route. */
export default async function NotFound() {
  // Render per request so the header shows live categories (never a build-time snapshot).
  await connection();
  return (
    <Providers>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main id="main" className="container-page flex-1 py-section">
          <EmptyState
            icon={<Compass size={28} aria-hidden="true" />}
            title="We couldn’t find that page"
            description="The link may be broken or the page may have moved."
            action={
              <Link href="/" className={buttonVariants({ variant: 'accent' })}>
                Go to the homepage
              </Link>
            }
          />
        </main>
        <SiteFooter />
      </div>
    </Providers>
  );
}
