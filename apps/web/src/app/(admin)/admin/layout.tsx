import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Providers } from '@/components/Providers';
import { requireStaff } from '@/lib/auth/staff';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Admin | SeShaKart' },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff('/admin');
  return (
    <Providers>
      <AdminShell user={user}>{children}</AdminShell>
    </Providers>
  );
}
