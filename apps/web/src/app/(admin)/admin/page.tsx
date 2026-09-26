import type { DashboardDto } from '@seshakart/types';
import { cn, formatINR } from '@seshakart/ui';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { SalesChart } from '@/components/admin/SalesChart';
import { StatTile } from '@/components/admin/StatTile';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { dateTime } from '@/lib/orders/format';

export const metadata = { title: 'Dashboard' };

const PERIODS = [
  ['today', 'Today', 'day'],
  ['7d', 'Last 7 days', '7 days'],
  ['30d', 'Last 30 days', '30 days'],
] as const;

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireStaff('/admin', 'dashboard:read');
  const { data: d } = await serverApi<DashboardDto>('/admin/dashboard');
  const sp = await searchParams;
  const period = PERIODS.find(([k]) => k === sp.period) ?? PERIODS[1];
  const kpi = period[0] === 'today' ? d.today : period[0] === '7d' ? d.last7Days : d.last30Days;
  const can = (p: string) => user.permissions.includes(p as never);

  const queues = [
    {
      label: 'Orders to ship',
      value: d.queues.toShip,
      href: '/admin/orders?status=to_ship',
      show: can('orders:read'),
      urgent: d.queues.toShip > 0,
    },
    {
      label: 'Open returns',
      value: d.queues.openReturns,
      href: '/admin/returns',
      show: can('orders:read'),
      urgent: d.queues.openReturns > 0,
    },
    {
      label: 'Manual refunds to pay',
      value: d.queues.pendingManualRefunds,
      href: '/admin/orders?status=refund_pending',
      show: can('orders:refund'),
      urgent: d.queues.pendingManualRefunds > 0,
    },
    {
      label: 'Awaiting payment',
      value: d.queues.paymentPending,
      href: '/admin/orders?status=PAYMENT_PENDING',
      show: can('orders:read'),
      urgent: false,
    },
    {
      label: 'Low stock',
      value: d.queues.lowStock,
      href: '/admin/inventory?stock=low',
      show: can('inventory:read'),
      urgent: d.queues.lowStock > 0,
    },
    {
      label: 'Out of stock',
      value: d.queues.outOfStock,
      href: '/admin/inventory?stock=out',
      show: can('inventory:read'),
      urgent: d.queues.outOfStock > 0,
    },
    {
      label: 'Reviews to moderate',
      value: d.queues.pendingReviews,
      href: '/admin/reviews',
      show: can('reviews:moderate'),
      urgent: d.queues.pendingReviews > 0,
    },
  ].filter((q) => q.show);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h2">Dashboard</h1>
          <p className="text-small text-text-muted">
            Updated {dateTime(d.generatedAt)}. Sales are confirmed orders, excluding cancellations.
          </p>
        </div>
        <nav
          aria-label="Period"
          className="grid w-full grid-cols-3 gap-1 rounded-button border border-border bg-surface p-1 sm:flex sm:w-auto"
        >
          {PERIODS.map(([k, label]) => (
            <Link
              key={k}
              href={`/admin?period=${k}`}
              aria-current={period[0] === k ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-sm px-2 py-1.5 text-center text-small font-medium no-underline sm:px-3',
                period[0] === k
                  ? 'bg-navy text-text-inverse'
                  : 'text-text-primary hover:bg-surface-muted',
              )}
            >
              {label.startsWith('Last ') ? (
                <>
                  <span className="hidden sm:inline">Last </span>
                  {label.slice(5)}
                </>
              ) : (
                label
              )}
            </Link>
          ))}
        </nav>
      </div>

      <section
        aria-label={`Sales, ${period[1].toLowerCase()}`}
        className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3"
      >
        <StatTile
          label="Sales"
          value={formatINR(kpi.revenue)}
          current={kpi.revenue}
          previous={kpi.previous.revenue}
          period={period[2]}
        />
        <StatTile
          label="Orders"
          value={kpi.orders.toLocaleString('en-IN')}
          current={kpi.orders}
          previous={kpi.previous.orders}
          period={period[2]}
        />
        <StatTile
          label="Average order value"
          value={formatINR(kpi.averageOrderValue)}
          current={kpi.averageOrderValue}
          previous={kpi.previous.averageOrderValue}
          period={period[2]}
        />
      </section>

      {queues.length > 0 && (
        <section aria-labelledby="queues">
          <h2 id="queues" className="sr-only">
            Needs attention
          </h2>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {queues.map((q) => (
              <li key={q.label}>
                <Link
                  href={q.href}
                  className="flex h-full flex-col gap-1 rounded-card border border-border bg-surface p-3 text-text-primary no-underline hover:border-primary"
                >
                  <span className="flex items-center gap-1.5 text-caption text-text-secondary">
                    {q.urgent && (
                      <AlertTriangle size={14} aria-hidden="true" className="text-warning-text" />
                    )}
                    {q.label}
                  </span>
                  <span className="font-heading text-h4 tabular-nums">{q.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-card border border-border bg-surface p-4 sm:p-6">
        <SalesChart data={d.daily} title="Daily sales, last 30 days" />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="recent"
          className="rounded-card border border-border bg-surface p-4 sm:p-6"
        >
          <div className="flex items-baseline justify-between">
            <h2 id="recent" className="text-h5">
              Recent orders
            </h2>
            {can('orders:read') && (
              <Link
                href="/admin/orders"
                className="inline-flex items-center text-small font-semibold"
              >
                All orders <ChevronRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
          {d.recentOrders.length === 0 ? (
            <p className="mt-3 text-small text-text-muted">No orders yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-small">
                <thead className="text-left text-text-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Order
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Customer
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Placed
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Status
                    </th>
                    <th scope="col" className="py-2 text-right font-medium">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentOrders.map((o) => (
                    <tr key={o.orderNumber} className="border-t border-border">
                      <td className="py-2 pr-3 font-mono">
                        {can('orders:read') ? (
                          <Link href={`/admin/orders/${o.orderNumber}`}>{o.orderNumber}</Link>
                        ) : (
                          o.orderNumber
                        )}
                      </td>
                      <td className="py-2 pr-3">{o.customer}</td>
                      <td className="py-2 pr-3 text-text-muted">{dateTime(o.placedAt)}</td>
                      <td className="py-2 pr-3">
                        <OrderStatusBadge status={o.status} label={o.statusLabel} />
                      </td>
                      <td className="py-2 text-right tabular-nums">{formatINR(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section
          aria-labelledby="top"
          className="rounded-card border border-border bg-surface p-4 sm:p-6"
        >
          <h2 id="top" className="text-h5">
            Top products, last 30 days
          </h2>
          {d.topProducts.length === 0 ? (
            <p className="mt-3 text-small text-text-muted">No sales yet.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2 text-small">
              {d.topProducts.map((p, i) => (
                <li
                  key={`${p.productId}-${i}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <span className="min-w-0 truncate">
                    <span className="text-text-muted">{i + 1}.</span> {p.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatINR(p.revenue)} <span className="text-text-muted">· {p.units} sold</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
