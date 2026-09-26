import type { InventoryRowDto } from '@seshakart/types';
import { EmptyState, buttonVariants, cn } from '@seshakart/ui';
import { inventoryListQuerySchema } from '@seshakart/validation';
import { Warehouse } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/admin/PageHeader';
import { InventoryTable } from '@/components/admin/catalog/InventoryTable';
import { Pagination } from '@/components/catalog/Pagination';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Inventory' };

const TABS = [
  ['all', 'All variants'],
  ['low', 'Low stock'],
  ['out', 'Out of stock'],
] as const;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff('/admin/inventory', 'inventory:read');
  const sp = await searchParams;
  const q = inventoryListQuerySchema.catch(inventoryListQuerySchema.parse({})).parse(sp);
  const params = new URLSearchParams();
  if (q.q) params.set('q', q.q);
  if (q.stock !== 'all') params.set('stock', q.stock);
  if (q.page > 1) params.set('page', String(q.page));
  const { data, meta } = await serverApi<InventoryRowDto[]>(`/admin/inventory?${params}`);
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    for (const [k, v] of Object.entries(patch))
      if (v === null) next.delete(k);
      else next.set(k, v);
    const s = next.toString();
    return `/admin/inventory${s ? `?${s}` : ''}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Inventory"
        description="Stock per variant. Available = in stock − reserved for open orders. Low and out-of-stock views list live products only."
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav
          aria-label="Stock level"
          className="flex gap-1 rounded-button border border-border bg-surface p-1"
        >
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={href({ stock: k === 'all' ? null : k })}
              aria-current={q.stock === k ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-sm px-3 py-1.5 text-small font-medium no-underline',
                q.stock === k
                  ? 'bg-navy text-text-inverse'
                  : 'text-text-primary hover:bg-surface-muted',
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form method="get" role="search" aria-label="Search stock" className="flex gap-2">
          {q.stock !== 'all' && <input type="hidden" name="stock" value={q.stock} />}
          <label htmlFor="inv-q" className="sr-only">
            Product name or SKU
          </label>
          <input
            id="inv-q"
            name="q"
            defaultValue={q.q ?? ''}
            placeholder="Product name or SKU"
            className="h-control-md w-56 rounded-input border border-border-strong bg-surface px-3 text-small focus:border-primary focus:shadow-focus focus:outline-none"
          />
          <button type="submit" className={buttonVariants({ variant: 'outline', size: 'md' })}>
            Search
          </button>
        </form>
      </div>
      {data.length === 0 ? (
        <EmptyState
          icon={<Warehouse size={32} aria-hidden="true" />}
          title={
            q.stock === 'all'
              ? 'Nothing found'
              : q.stock === 'low'
                ? 'No low stock'
                : 'Nothing is out of stock'
          }
          description={q.q ? 'Try a different search.' : undefined}
        />
      ) : (
        <InventoryTable rows={data} canWrite={user.permissions.includes('inventory:write')} />
      )}
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => `${href({})}${href({}).includes('?') ? '&' : '?'}page=${p}`}
        />
      )}
    </div>
  );
}
