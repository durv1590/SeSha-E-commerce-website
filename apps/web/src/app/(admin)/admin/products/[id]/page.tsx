import type { AdminBrandDto, AdminCategoryDto, AdminProductDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProductEditor } from '@/components/admin/catalog/ProductEditor';
import { ApiError } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Edit product' };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff(`/admin/products/${id}`, 'products:read');
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const product = await serverApi<AdminProductDto>(`/admin/products/${id}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const [{ data: categories }, { data: brands }] = await Promise.all([
    serverApi<AdminCategoryDto[]>('/admin/categories'),
    serverApi<AdminBrandDto[]>('/admin/brands'),
  ]);
  return (
    <ProductEditor
      key={product.data.updatedAt}
      product={product.data}
      categories={categories}
      brands={brands}
      permissions={user.permissions}
    />
  );
}
