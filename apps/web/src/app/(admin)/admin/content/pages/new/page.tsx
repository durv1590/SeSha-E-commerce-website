import type { Metadata } from 'next';
import { PageEditor } from '@/components/admin/content/PageEditor';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'New page' };

export default async function NewPage() {
  await requireStaff('/admin/content/pages/new', 'content:write');
  return <PageEditor page={null} />;
}
