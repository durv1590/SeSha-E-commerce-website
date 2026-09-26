import type { AdminReturnListItemDto } from '@seshakart/types';
import { Badge, EmptyState, cn } from '@seshakart/ui';
import { adminReturnListQuerySchema } from '@seshakart/validation';
import { RotateCcw } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { QueueTabs } from '@/components/admin/QueueTabs';
import { Pagination } from '@/components/catalog/Pagination';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { dateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Returns' };

const TABS = [
  ['open', 'Open'],
  ['REQUESTED', 'To review'],
  ['APPROVED', 'Awaiting pickup'],
  ['RECEIVED', 'Received'],
  ['COMPLETED', 'Completed'],
  ['REJECTED', 'Rejected'],
  ['all', 'All'],
] as const;

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff('/admin/returns', 'orders:read');
  const q = adminReturnListQuerySchema
    .catch(adminReturnListQuerySchema.parse({}))
    .parse(await searchParams);
  const { data, meta } = await serverApi<AdminReturnListItemDto[]>(
    `/admin/returns?status=${q.status}&page=${q.page}`,
  );
  const href = (status: string, page?: number) =>
    `/admin/returns?${new URLSearchParams({ ...(status !== 'open' ? { status } : {}), ...(page && page > 1 ? { page: String(page) } : {}) })}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Returns and replacements"
        description="Open requests are listed oldest first. Act on them from the order page."
      />
      <QueueTabs
        label="Return status"
        items={TABS.map(([k, label]) => ({ href: href(k), label, current: q.status === k }))}
      />
      {data.length === 0 ? (
        <EmptyState
          icon={<RotateCcw size={32} aria-hidden="true" />}
          title="Nothing here"
          description="No return requests in this view."
        />
      ) : (
        <AdminTable label="Return requests">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                Order
              </th>
              <th scope="col" className={th}>
                Requested
              </th>
              <th scope="col" className={th}>
                Customer
              </th>
              <th scope="col" className={th}>
                Type
              </th>
              <th scope="col" className={th}>
                Reason
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Units
              </th>
              <th scope="col" className={th}>
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border first:border-t-0 hover:bg-surface-muted/60"
              >
                <td className={td}>
                  <Link
                    href={`/admin/orders/${r.orderNumber}`}
                    className="font-mono font-semibold text-primary-dark"
                  >
                    {r.orderNumber}
                  </Link>
                </td>
                <td className={cn(td, 'whitespace-nowrap text-text-secondary')}>
                  {dateTime(r.createdAt)}
                </td>
                <td className={td}>{r.customerName || '—'}</td>
                <td className={td}>{r.type === 'RETURN' ? 'Return' : 'Replacement'}</td>
                <td className={cn(td, 'text-text-secondary')}>
                  {r.reason.replace(/_/g, ' ').toLowerCase()}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>{r.units}</td>
                <td className={td}>
                  <Badge
                    variant={
                      r.status === 'COMPLETED'
                        ? 'success'
                        : r.status === 'REJECTED'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {r.statusLabel}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => href(q.status, p)}
        />
      )}
    </div>
  );
}
