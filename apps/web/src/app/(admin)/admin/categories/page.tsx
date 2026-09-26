import type { AdminCategoryDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { CategoryManager } from '@/components/admin/catalog/CategoryManager';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  await requireStaff('/admin/categories', 'categories:write');
  const { data } = await serverApi<AdminCategoryDto[]>('/admin/categories');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Categories"
        description="Up to three levels: category, subcategory and sub-subcategory."
      />
      <CategoryManager categories={data} />
    </div>
  );
}
