import type { OrderListItemDto, PaginationMeta } from '@seshakart/types';
import { EmptyState, buttonVariants, cn, formatINR } from '@seshakart/ui';
import { ChevronRight, Package } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Pagination } from '@/components/catalog/Pagination';
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge';
import { serverApi } from '@/lib/api/server';
import { longDate } from '@/lib/orders/format';

export const metadata = { title: 'Orders' };

const FILTERS = [
  ['all', 'All'],
  ['active', 'In progress'],
  ['delivered', 'Delivered'],
  ['cancelled', 'Cancelled'],
  ['returns', 'Returns & refunds'],
] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filter = FILTERS.some(([k]) => k === sp.filter) ? sp.filter! : 'all';
  const page = Math.max(1, Number(sp.page) || 1);
  const res = await serverApi<OrderListItemDto[]>(
    `/orders?filter=${filter}&page=${page}&pageSize=10`,
  );
  const orders = res.data;
  const meta = res.meta as PaginationMeta;
  const href = (f: string, p = 1) =>
    `/account/orders?${new URLSearchParams({ ...(f !== 'all' ? { filter: f } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`.replace(
      /\?$/,
      '',
    );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-h2">Orders</h1>
        <p className="mt-1 text-text-secondary">Track, return or buy things again.</p>
      </div>
      <nav aria-label="Filter orders" className="-mx-gutter overflow-x-auto px-gutter">
        <ul className="flex gap-2">
          {FILTERS.map(([k, label]) => (
            <li key={k}>
              <Link
                href={href(k)}
                aria-current={filter === k ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center whitespace-nowrap rounded-pill border px-4 text-small font-medium no-underline',
                  filter === k
                    ? 'border-primary bg-primary-light text-primary-dark'
                    : 'border-border-strong text-text-primary hover:border-primary',
                )}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {orders.length === 0 ? (
        <EmptyState
          icon={<Package size={28} aria-hidden="true" />}
          title={filter === 'all' ? 'No orders yet' : 'No orders here'}
          description={
            filter === 'all'
              ? 'When you place an order, you can track it here.'
              : 'Try another filter.'
          }
          action={
            <Link
              href={filter === 'all' ? '/deals' : '/account/orders'}
              className={buttonVariants({ variant: 'primary' })}
            >
              {filter === 'all' ? 'Start shopping' : 'Show all orders'}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.orderNumber}>
              <Link
                href={`/account/orders/${o.orderNumber}`}
                className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-border bg-surface p-4 text-text-primary no-underline hover:border-primary sm:grid-cols-[auto_minmax(0,1fr)_auto]"
              >
                <span className="col-span-2 flex -space-x-3 sm:col-span-1" aria-hidden="true">
                  {o.images.map((src, i) => (
                    <span
                      key={i}
                      className="relative block size-14 overflow-hidden rounded-md border-2 border-surface bg-surface-muted"
                    >
                      {src && (
                        <Image src={src} alt="" fill sizes="56px" className="object-contain p-1" />
                      )}
                    </span>
                  ))}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={o.status} label={o.statusLabel} />
                    {o.deliveryNote && (
                      <span className="text-small font-medium">{o.deliveryNote}</span>
                    )}
                  </span>
                  <span className="mt-1 block truncate font-semibold">
                    {o.firstItemName}
                    {o.itemCount > 1 ? ` and ${o.itemCount - 1} more` : ''}
                  </span>
                  <span className="block text-small text-text-muted">
                    <span className="font-mono">{o.orderNumber}</span> · {longDate(o.placedAt)} ·{' '}
                    {formatINR(o.total)}
                  </span>
                </span>
                <ChevronRight
                  size={20}
                  aria-hidden="true"
                  className="text-text-muted group-hover:text-primary"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={(p) => href(filter, p)} />
    </div>
  );
}
