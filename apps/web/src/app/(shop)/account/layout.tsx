import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountNav } from '@/components/account/AccountNav';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: { default: 'My account', template: '%s | My account | SeShaKart' },
  robots: { index: false, follow: false },
};

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser('/account');
  return (
    <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-6 py-section-sm lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
      <aside className="flex min-w-0 flex-col gap-4">
        <div className="hidden lg:block">
          <p className="text-caption uppercase tracking-wide text-text-muted">Signed in as</p>
          <p className="truncate font-heading text-h5">{user.name}</p>
        </div>
        <AccountNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
