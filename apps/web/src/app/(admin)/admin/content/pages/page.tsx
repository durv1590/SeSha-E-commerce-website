import type { AdminPageDto } from '@seshakart/types';
import { Badge, buttonVariants, cn } from '@seshakart/ui';
import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { dateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Pages' };

export default async function PagesPage() {
  await requireStaff('/admin/content/pages', 'content:write');
  const { data } = await serverApi<AdminPageDto[]>('/admin/pages');
  const drafts = data.filter((p) => !p.isPublished).length;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Pages"
        description="About us, contact and policy pages. Published pages are linked in the store footer."
        actions={
          <Link href="/admin/content/pages/new" className={buttonVariants({ size: 'md' })}>
            <Plus size={16} aria-hidden="true" /> New page
          </Link>
        }
      />
      {drafts > 0 && (
        <p className="rounded-card border border-warning bg-warning-light p-3 text-small text-warning-text">
          {drafts} draft page{drafts === 1 ? ' is' : 's are'} not yet visible to shoppers. Review
          the text (policies should be checked by a legal adviser) and publish when ready.
        </p>
      )}
      <AdminTable label="Pages">
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={th}>
              Title
            </th>
            <th scope="col" className={th}>
              URL
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={th}>
              Last edited
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr
              key={p.id}
              className="border-t border-border first:border-t-0 hover:bg-surface-muted/60"
            >
              <td className={td}>
                <Link
                  href={`/admin/content/pages/${p.id}`}
                  className="font-medium text-primary-dark"
                >
                  {p.title}
                </Link>
              </td>
              <td className={cn(td, 'font-mono text-caption text-text-muted')}>/pages/{p.slug}</td>
              <td className={td}>
                <Badge variant={p.isPublished ? 'success' : 'neutral'}>
                  {p.isPublished ? 'Published' : 'Draft'}
                </Badge>
              </td>
              <td className={cn(td, 'text-text-secondary')}>
                {dateTime(p.updatedAt)}
                {p.updatedBy && ` · ${p.updatedBy}`}
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTable>
    </div>
  );
}
