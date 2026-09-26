import type { AdminCategoryDto, AdminHomeSectionDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { HomeSectionsManager } from '@/components/admin/content/HomeSectionsManager';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Homepage' };

export default async function HomeSectionsPage() {
  const user = await requireStaff('/admin/content/home', 'content:write');
  const canCategories =
    user.permissions.includes('products:read') || user.permissions.includes('categories:write');
  const [{ data }, categories] = await Promise.all([
    serverApi<AdminHomeSectionDto[]>('/admin/home-sections'),
    canCategories
      ? serverApi<AdminCategoryDto[]>('/admin/categories').then((r) => r.data)
      : Promise.resolve([]),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Homepage sections"
        description="Product rails shown on the homepage, top to bottom. Rails fill themselves from live products; empty rails are hidden."
      />
      <HomeSectionsManager sections={data} categories={categories} />
    </div>
  );
}
