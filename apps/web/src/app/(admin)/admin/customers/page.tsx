import type { CustomerListItemDto } from '@seshakart/types';
import { Badge, EmptyState, buttonVariants, cn, formatINR } from '@seshakart/ui';
import { customerListQuerySchema } from '@seshakart/validation';
import { Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { Pagination } from '@/components/catalog/Pagination';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { longDate } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Customers' };
const control =
  'h-control-md w-full rounded-input border border-border-strong bg-surface px-3 text-small focus:border-primary focus:shadow-focus focus:outline-none';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff('/admin/customers', 'customers:read');
  const q = customerListQuerySchema
    .catch(customerListQuerySchema.parse({}))
    .parse(await searchParams);
  const params = new URLSearchParams();
  if (q.q) params.set('q', q.q);
  if (q.status !== 'all') params.set('status', q.status);
  if (q.sort !== 'recent') params.set('sort', q.sort);
  const { data, meta } = await serverApi<CustomerListItemDto[]>(
    `/admin/customers?${params}&page=${q.page}`,
  );
  const filtered = Boolean(q.q || q.status !== 'all');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Customers"
        description={`${meta?.total ?? data.length} customer account${meta?.total === 1 ? '' : 's'}`}
      />
      <form
        method="get"
        role="search"
        aria-label="Filter customers"
        className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
      >
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Search
          <input
            name="q"
            defaultValue={q.q ?? ''}
            placeholder="Name, email or phone"
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Status
          <select name="status" defaultValue={q.status} className={control}>
            <option value="all">All</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Sort by
          <select name="sort" defaultValue={q.sort} className={control}>
            <option value="recent">Newest</option>
            <option value="spent">Most spent</option>
            <option value="orders">Most orders</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonVariants({ size: 'md' })}>
            Apply
          </button>
          {filtered && (
            <Link
              href="/admin/customers"
              className={buttonVariants({ variant: 'ghost', size: 'md' })}
            >
              Clear
            </Link>
          )}
        </div>
      </form>
      {data.length === 0 ? (
        <EmptyState
          icon={<Users size={32} aria-hidden="true" />}
          title={filtered ? 'No customers match' : 'No customers yet'}
        />
      ) : (
        <AdminTable label="Customers">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                Customer
              </th>
              <th scope="col" className={th}>
                Contact
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Orders
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Spent
              </th>
              <th scope="col" className={th}>
                Last order
              </th>
              <th scope="col" className={th}>
                Joined
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr
                key={c.id}
                className="border-t border-border first:border-t-0 hover:bg-surface-muted/60"
              >
                <td className={td}>
                  <Link href={`/admin/customers/${c.id}`} className="font-medium text-primary-dark">
                    {c.name}
                  </Link>
                  {c.status === 'SUSPENDED' && (
                    <Badge variant="error" className="ml-2">
                      Suspended
                    </Badge>
                  )}
                </td>
                <td className={cn(td, 'text-text-secondary')}>
                  {c.email && <span className="block">{c.email}</span>}
                  {c.phone && <span className="block">+91 {c.phone}</span>}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>{c.orderCount}</td>
                <td className={cn(td, 'text-right tabular-nums')}>{formatINR(c.totalSpent)}</td>
                <td className={cn(td, 'whitespace-nowrap text-text-secondary')}>
                  {c.lastOrderAt ? longDate(c.lastOrderAt) : '—'}
                </td>
                <td className={cn(td, 'whitespace-nowrap text-text-secondary')}>
                  {longDate(c.createdAt)}
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
          hrefFor={(p) => {
            const n = new URLSearchParams(params);
            n.set('page', String(p));
            return `/admin/customers?${n}`;
          }}
        />
      )}
    </div>
  );
}
