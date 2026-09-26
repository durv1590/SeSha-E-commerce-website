import type { AdminSeoOverrideDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { SeoManager } from '@/components/admin/content/SeoManager';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'SEO' };

export default async function SeoPage() {
  await requireStaff('/admin/seo', 'seo:write');
  const { data } = await serverApi<AdminSeoOverrideDto[]>('/admin/seo');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Search engine settings"
        description="Override the title, description and sharing image for specific store pages."
      />
      <SeoManager rules={data} />
    </div>
  );
}
