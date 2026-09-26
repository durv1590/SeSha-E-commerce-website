import type { AdminCategoryDto, AdminProductListItemDto } from '@seshakart/types';
import { Badge, EmptyState, buttonVariants, cn, formatINR } from '@seshakart/ui';
import { adminProductListQuerySchema } from '@seshakart/validation';
import { Download, Package, Plus, Upload } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { PRODUCT_STATUS } from '@/components/admin/catalog/status';
import { Pagination } from '@/components/catalog/Pagination';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Products' };

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff('/admin/products', 'products:read');
  const sp = await searchParams;
  const q = adminProductListQuerySchema.catch(adminProductListQuerySchema.parse({})).parse(sp);
  const params = new URLSearchParams(
    Object.entries(sp).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const [{ data: rows, meta }, { data: categories }] = await Promise.all([
    serverApi<AdminProductListItemDto[]>(`/admin/products?${params}`),
    serverApi<AdminCategoryDto[]>('/admin/categories'),
  ]);
  const canWrite = user.permissions.includes('products:write');
  const filtered = Boolean(q.q || q.status !== 'all' || q.stock !== 'all' || q.categoryId);
  const hrefFor = (page: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(page));
    return `/admin/products?${next}`;
  };
  const select =
    'h-control-md rounded-input border border-border-strong bg-surface px-3 text-small focus:border-primary focus:shadow-focus focus:outline-none';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Products"
        description={`${meta?.total ?? rows.length} product${meta?.total === 1 ? '' : 's'}${filtered ? ' match these filters' : ''}`}
        actions={
          <>
            <a
              href="/api/admin/products/export.csv"
              className={buttonVariants({ variant: 'outline', size: 'md' })}
              download
            >
              <Download size={16} aria-hidden="true" /> Export CSV
            </a>
            {canWrite && (
              <>
                <Link
                  href="/admin/products/import"
                  className={buttonVariants({ variant: 'outline', size: 'md' })}
                >
                  <Upload size={16} aria-hidden="true" /> Import CSV
                </Link>
                <Link href="/admin/products/new" className={buttonVariants({ size: 'md' })}>
                  <Plus size={16} aria-hidden="true" /> Add product
                </Link>
              </>
            )}
          </>
        }
      />

      <form
        method="get"
        role="search"
        aria-label="Filter products"
        className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]"
      >
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Search
          <input
            name="q"
            defaultValue={q.q ?? ''}
            placeholder="Name or SKU"
            className={cn(select, 'w-full')}
          />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Status
          <select name="status" defaultValue={q.status} className={select}>
            <option value="all">All statuses</option>
            <option value="ACTIVE">Live</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Category
          <select name="categoryId" defaultValue={q.categoryId ?? ''} className={select}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {' '.repeat(c.depth)}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Stock
          <select name="stock" defaultValue={q.stock} className={select}>
            <option value="all">Any stock</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Sort by
          <select name="sort" defaultValue={q.sort} className={select}>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="price">Price</option>
            <option value="stock">Stock (lowest first)</option>
            <option value="sold">Best selling</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonVariants({ size: 'md' })}>
            Apply
          </button>
          {filtered && (
            <Link
              href="/admin/products"
              className={buttonVariants({ variant: 'ghost', size: 'md' })}
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package size={32} aria-hidden="true" />}
          title={filtered ? 'No products match' : 'No products yet'}
          description={
            filtered
              ? 'Try a different search or clear the filters.'
              : 'Add your first product or import a CSV file.'
          }
        />
      ) : (
        <AdminTable label="Products">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                Product
              </th>
              <th scope="col" className={th}>
                Status
              </th>
              <th scope="col" className={th}>
                Category
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Price
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Available
              </th>
              <th scope="col" className={cn(th, 'text-right')}>
                Sold
              </th>
              <th scope="col" className={th}>
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const s = PRODUCT_STATUS[p.status];
              return (
                <tr
                  key={p.id}
                  className="border-t border-border first:border-t-0 hover:bg-surface-muted/60"
                >
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <span className="relative block size-11 shrink-0 overflow-hidden rounded-sm border border-border bg-surface">
                        {p.imageUrl && (
                          <Image
                            src={p.imageUrl}
                            alt=""
                            fill
                            sizes="44px"
                            className="object-contain p-0.5"
                          />
                        )}
                      </span>
                      <span className="min-w-0">
                        <Link
                          href={`/admin/products/${p.id}`}
                          className="line-clamp-2 font-medium text-text-primary hover:text-primary-dark"
                        >
                          {p.name}
                        </Link>
                        <span className="block font-mono text-caption text-text-muted">
                          {p.sku} · {p.variantCount} variant{p.variantCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className={td}>
                    <Badge variant={s.badge}>{s.label}</Badge>
                    {p.isFeatured && (
                      <span className="mt-1 block text-caption text-text-muted">Featured</span>
                    )}
                  </td>
                  <td className={cn(td, 'text-text-secondary')}>{p.category.name}</td>
                  <td className={cn(td, 'text-right tabular-nums')}>
                    {p.minPrice ? formatINR(p.minPrice) : '—'}
                  </td>
                  <td className={cn(td, 'text-right tabular-nums')}>
                    <span
                      className={cn(
                        p.availableStock <= 0
                          ? 'font-semibold text-error-text'
                          : p.lowStock && 'font-semibold text-warning-text',
                      )}
                    >
                      {p.availableStock}
                    </span>
                    {p.availableStock <= 0 ? (
                      <span className="block text-caption text-error-text">Out of stock</span>
                    ) : (
                      p.lowStock && (
                        <span className="block text-caption text-warning-text">Low</span>
                      )
                    )}
                  </td>
                  <td className={cn(td, 'text-right tabular-nums')}>{p.soldCount}</td>
                  <td className={cn(td, 'whitespace-nowrap text-text-muted')}>
                    {dateTime(p.updatedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      )}
      {meta && <Pagination page={meta.page} totalPages={meta.totalPages} hrefFor={hrefFor} />}
    </div>
  );
}
