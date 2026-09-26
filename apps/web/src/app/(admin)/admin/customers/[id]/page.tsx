import type { CustomerDetailDto } from '@seshakart/types';
import { Badge, cn, formatINR } from '@seshakart/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { CustomerStatusButton } from '@/components/admin/ops/CustomerStatusButton';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { ApiError } from '@/lib/api/errors';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { dateTime, longDate } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Customer' };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff(`/admin/customers/${id}`, 'customers:read');
  if (!/^[a-z0-9]{1,40}$/i.test(id)) notFound();
  const { data: c } = await serverApi<CustomerDetailDto>(`/admin/customers/${id}`).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const stats = [
    ['Orders', String(c.orderCount)],
    ['Spent', formatINR(c.totalSpent)],
    [
      'Average order',
      c.orderCount ? formatINR(Math.round(c.totalSpent / Math.max(1, c.orderCount))) : '—',
    ],
    ['Customer since', longDate(c.createdAt)],
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/customers"
          className="self-start text-small font-medium text-primary-dark"
        >
          ← All customers
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-h2">{c.name}</h1>
            <Badge variant={c.status === 'ACTIVE' ? 'success' : 'error'}>
              {c.status === 'ACTIVE' ? 'Active' : 'Suspended'}
            </Badge>
          </div>
          {user.permissions.includes('customers:write') && (
            <CustomerStatusButton id={c.id} name={c.name} status={c.status} />
          )}
        </div>
        <p className="text-small text-text-secondary">
          {c.email && (
            <>
              <a href={`mailto:${c.email}`}>{c.email}</a>{' '}
              {c.emailVerified ? '(verified)' : '(not verified)'}
            </>
          )}
          {c.email && c.phone && ' · '}
          {c.phone && (
            <>
              <a href={`tel:+91${c.phone}`}>+91 {c.phone}</a>{' '}
              {c.phoneVerified ? '(verified)' : '(not verified)'}
            </>
          )}
        </p>
        <p className="text-caption text-text-muted">
          Last sign-in {c.lastLoginAt ? dateTime(c.lastLoginAt) : 'never'} · {c.activeSessions}{' '}
          active session{c.activeSessions === 1 ? '' : 's'} ·{' '}
          {c.marketingOptIn ? 'Accepts marketing emails' : 'No marketing emails'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-card border border-border bg-surface p-3">
            <dt className="text-caption text-text-secondary">{k}</dt>
            <dd className="text-h4 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="orders-h" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="orders-h" className="text-h4">
            Recent orders
          </h2>
          {c.email && c.orderCount > c.recentOrders.length && (
            <Link
              href={`/admin/orders?q=${encodeURIComponent(c.email)}`}
              className="text-small font-medium text-primary-dark"
            >
              All orders
            </Link>
          )}
        </div>
        {c.recentOrders.length === 0 ? (
          <p className="text-small text-text-muted">No orders yet.</p>
        ) : (
          <AdminTable label={`Orders placed by ${c.name}`}>
            <thead className="border-b border-border bg-surface-muted">
              <tr>
                <th scope="col" className={th}>
                  Order
                </th>
                <th scope="col" className={th}>
                  Placed
                </th>
                <th scope="col" className={th}>
                  Status
                </th>
                <th scope="col" className={cn(th, 'text-right')}>
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {c.recentOrders.map((o) => (
                <tr key={o.orderNumber} className="border-t border-border first:border-t-0">
                  <td className={td}>
                    <Link
                      href={`/admin/orders/${o.orderNumber}`}
                      className="font-mono font-semibold text-primary-dark"
                    >
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className={cn(td, 'text-text-secondary')}>{dateTime(o.placedAt)}</td>
                  <td className={td}>
                    <OrderStatusBadge status={o.status} label={o.statusLabel} />
                  </td>
                  <td className={cn(td, 'text-right tabular-nums')}>{formatINR(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </section>

      <section aria-labelledby="addr-h" className="flex flex-col gap-3">
        <h2 id="addr-h" className="text-h4">
          Saved addresses
        </h2>
        {c.addresses.length === 0 ? (
          <p className="text-small text-text-muted">No saved addresses.</p>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {c.addresses.map((a) => (
              <li
                key={a.id}
                className="rounded-card border border-border bg-surface p-3 text-small"
              >
                <p className="font-medium">
                  {a.name}
                  {a.isDefault && (
                    <Badge variant="info" className="ml-2">
                      Default
                    </Badge>
                  )}
                </p>
                <p className="text-text-secondary">
                  {a.line}
                  <br />
                  {a.city}, {a.state} {a.pincode}
                  <br />
                  +91 {a.phone}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
