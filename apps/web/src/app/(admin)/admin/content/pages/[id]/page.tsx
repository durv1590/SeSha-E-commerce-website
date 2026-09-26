import type { AdminPageDto } from '@seshakart/types';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageEditor } from '@/components/admin/content/PageEditor';
import { ApiError } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Edit page' };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaff(`/admin/content/pages/${id}`, 'content:write');
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const { data } = await serverApi<AdminPageDto>(`/admin/pages/${id}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  return <PageEditor key={data.updatedAt} page={data} />;
}
