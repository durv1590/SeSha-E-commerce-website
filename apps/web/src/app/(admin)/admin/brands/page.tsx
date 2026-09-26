import type { AdminBrandDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { BrandManager } from '@/components/admin/catalog/BrandManager';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Brands' };

export default async function BrandsPage() {
  await requireStaff('/admin/brands', 'brands:write');
  const { data } = await serverApi<AdminBrandDto[]>('/admin/brands');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Brands"
        description={`${data.length} brand${data.length === 1 ? '' : 's'}`}
      />
      <BrandManager brands={data} />
    </div>
  );
}
