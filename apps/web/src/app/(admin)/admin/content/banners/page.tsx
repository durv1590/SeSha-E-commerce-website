import type { AdminBannerDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { BannerManager } from '@/components/admin/content/BannerManager';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Banners' };

export default async function BannersPage() {
  await requireStaff('/admin/content/banners', 'content:write');
  const { data } = await serverApi<AdminBannerDto[]>('/admin/banners');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Banners" description="Changes appear on the store immediately." />
      <BannerManager banners={data} />
    </div>
  );
}
