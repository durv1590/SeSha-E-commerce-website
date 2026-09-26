import type { AdminBrandDto, AdminCategoryDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { ProductEditor } from '@/components/admin/catalog/ProductEditor';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Add product' };

export default async function NewProductPage() {
  const user = await requireStaff('/admin/products/new', 'products:write');
  const [{ data: categories }, { data: brands }] = await Promise.all([
    serverApi<AdminCategoryDto[]>('/admin/categories'),
    serverApi<AdminBrandDto[]>('/admin/brands'),
  ]);
  return (
    <ProductEditor
      product={null}
      categories={categories}
      brands={brands}
      permissions={user.permissions}
    />
  );
}
