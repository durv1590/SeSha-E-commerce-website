import { ORDER_STATUS_LABELS, type AdminOrderListItemDto } from '@seshakart/types';
import { EmptyState, buttonVariants, cn, formatINR } from '@seshakart/ui';
import { adminOrderListQuerySchema } from '@seshakart/validation';
import { ClipboardList, Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { QueueTabs } from '@/components/admin/QueueTabs';
import { Pagination } from '@/components/catalog/Pagination';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { dateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Orders' };

const QUEUES = [
  ['all', 'All orders'],
  ['to_ship', 'To ship'],
  ['PAYMENT_PENDING', 'Awaiting payment'],
  ['returns', 'Open returns'],
  ['refund_pending', 'Manual refunds'],
] as const;
const STATUSES = [
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUND_INITIATED',
  'REFUNDED',
] as const;
const control =
  'h-control-md w-full rounded-input border border-border-strong bg-surface px-3 text-small focus:border-primary focus:shadow-focus focus:outline-none';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff('/admin/orders', 'orders:read');
  const sp = await searchParams;
  const parsed = adminOrderListQuerySchema.safeParse(sp);
  const q = parsed.success ? parsed.data : adminOrderListQuerySchema.parse({});
  const params = new URLSearchParams();
  if (q.q) params.set('q', q.q);
  if (q.status !== 'all') params.set('status', q.status);
  if (q.payment !== 'all') params.set('payment', q.payment);
  if (q.from) params.set('from', q.from);
  if (q.to) params.set('to', q.to);
  const { data, meta } = await serverApi<AdminOrderListItemDto[]>(
    `/admin/orders?${params}&page=${q.page}`,
  );
  const hrefWith = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    const s = next.toString();
    return `/admin/orders${s ? `?${s}` : ''}`;
  };
  const filtered = Boolean(q.q || q.payment !== 'all' || q.from || q.to);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Orders"
        description={`${meta?.total ?? data.length} order${meta?.total === 1 ? '' : 's'}`}
        actions={
          <a
            href={`/api/admin/orders/export.csv?${params}`}
            download
            className={buttonVariants({ variant: 'outline', size: 'md' })}
          >
            <Download size={16} aria-hidden="true" /> Export CSV
          </a>
        }
      />
      {!parsed.success && (
        <p role="alert" className="text-small text-error-text">
          Some filters weren’t valid and were ignored.
        </p>
      )}
      <QueueTabs
        label="Order queues"
        items={QUEUES.map(([k, label]) => ({
          href: hrefWith({ status: k === 'all' ? null : k }),
          label,
          current: q.status === k,
        }))}
      />
      <form
        method="get"
        role="search"
        aria-label="Filter orders"
        className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]"
      >
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Search
          <input
            name="q"
            defaultValue={q.q ?? ''}
            placeholder="Order no., name, email or phone"
            className={control}
          />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Status
          <select name="status" defaultValue={q.status} className={control}>
            {QUEUES.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Payment
          <select name="payment" defaultValue={q.payment} className={control}>
            <option value="all">Any payment</option>
            <option value="PREPAID">Paid online</option>
            <option value="COD">Cash on delivery</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          From
          <input type="date" name="from" defaultValue={q.from ?? ''} className={control} />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          To
          <input type="date" name="to" defaultValue={q.to ?? ''} className={control} />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonVariants({ size: 'md' })}>
            Apply
          </button>
          {(filtered || q.status !== 'all') && (
            <Link href="/admin/orders" className={buttonVariants({ variant: 'ghost', size: 'md' })}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {data.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={32} aria-hidden="true" />}
          title="No orders here"
          description={filtered ? 'Try different filters.' : 'Nothing is waiting in this queue.'}
        />
      ) : (
        <AdminTable label="Orders">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                Order
              </th>
              <th scope="col" className={th}>
                Placed
              </th>
              <th scope="col" className={th}>
                Customer
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={th}>
                Payment
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Items
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((o) => (
              <tr
                key={o.orderNumber}
                className="border-t border-border first:border-t-0 hover:bg-surface-muted/60"
              >
                <td className={td}>
                  <Link
                    href={`/admin/orders/${o.orderNumber}`}
                    className="font-mono font-semibold text-primary-dark"
                  >
                    {o.orderNumber}
                  </Link>
                </td>
                <td className={cn(td, 'whitespace-nowrap text-text-secondary')}>
                  {dateTime(o.placedAt)}
                </td>
                <td className={td}>
                  <span className="block font-medium">{o.customerName || '—'}</span>
                  <span className="block text-caption text-text-muted">
                    {o.city}
                    {o.userId ? '' : ' · guest'}
                  </span>
                </td>
                <td className={td}>
                  <OrderStatusBadge status={o.status} label={o.statusLabel} />
                </td>
                <td className={cn(td, 'text-text-secondary')}>
                  {o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}
                </td>
                <td className={cn(td, 'text-right tabular-nums')}>{o.itemCount}</td>
                <td className={cn(td, 'text-right font-medium tabular-nums')}>
                  {formatINR(o.total)}
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
            const h = hrefWith({ page: String(p) });
            return h;
          }}
        />
      )}
    </div>
  );
}
