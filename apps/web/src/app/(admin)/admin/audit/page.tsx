import type { AuditEntryDto } from '@seshakart/types';
import { EmptyState, buttonVariants, cn } from '@seshakart/ui';
import { auditQuerySchema } from '@seshakart/validation';
import { Gauge } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { Pagination } from '@/components/catalog/Pagination';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { dateTime } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Audit log' };

const AREAS = [
  ['', 'Everything'],
  ['order', 'Orders'],
  ['refund', 'Refunds'],
  ['product', 'Products'],
  ['inventory', 'Stock'],
  ['category', 'Categories'],
  ['brand', 'Brands'],
  ['coupon', 'Coupons'],
  ['review', 'Reviews'],
  ['banner', 'Banners'],
  ['home_section', 'Homepage'],
  ['page', 'Pages'],
  ['seo', 'SEO'],
  ['settings', 'Settings'],
  ['customer', 'Customers'],
  ['staff', 'Staff'],
  ['user', 'Accounts and sign-ins'],
] as const;
const control =
  'h-control-md w-full rounded-input border border-border-strong bg-surface px-3 text-small focus:border-primary focus:shadow-focus focus:outline-none';

function summary(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const m = metadata as Record<string, unknown>;
  const pick = [
    'sku',
    'code',
    'name',
    'title',
    'slug',
    'path',
    'email',
    'orderNumber',
    'reason',
    'from',
    'to',
    'mode',
    'quantity',
    'amount',
    'changed',
  ];
  return pick
    .filter((k) => m[k] !== undefined && m[k] !== null)
    .map((k) => `${k}: ${typeof m[k] === 'object' ? JSON.stringify(m[k]) : String(m[k])}`)
    .join(' · ')
    .slice(0, 240);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff('/admin/audit', 'audit:read');
  const sp = await searchParams;
  const parsed = auditQuerySchema.safeParse(sp);
  const q = parsed.success ? parsed.data : auditQuerySchema.parse({});
  const params = new URLSearchParams();
  for (const k of ['action', 'entityType', 'entityId', 'actorId', 'from', 'to'] as const)
    if (q[k]) params.set(k, q[k]!);
  const { data, meta } = await serverApi<AuditEntryDto[]>(
    `/admin/audit?${params}&page=${q.page}&pageSize=50`,
  );
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Audit log"
        description="Every staff change and sensitive account event, newest first. Entries can’t be edited or deleted."
      />
      <form
        method="get"
        role="search"
        aria-label="Filter the audit log"
        className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Area
          <select name="action" defaultValue={q.action ?? ''} className={control}>
            {AREAS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Record id
          <input name="entityId" defaultValue={q.entityId ?? ''} className={control} />
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
          {params.toString() && (
            <Link href="/admin/audit" className={buttonVariants({ variant: 'ghost', size: 'md' })}>
              Clear
            </Link>
          )}
        </div>
      </form>
      {data.length === 0 ? (
        <EmptyState
          icon={<Gauge size={32} aria-hidden="true" />}
          title="No entries"
          description="Nothing matches these filters."
        />
      ) : (
        <AdminTable label="Audit entries">
          <thead className="border-b border-border bg-surface-muted">
            <tr>
              <th scope="col" className={th}>
                When
              </th>
              <th scope="col" className={th}>
                Who
              </th>
              <th scope="col" className={th}>
                What
              </th>
              <th scope="col" className={th}>
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id} className="border-t border-border align-top first:border-t-0">
                <td className={cn(td, 'whitespace-nowrap text-text-secondary')}>
                  {dateTime(e.createdAt)}
                </td>
                <td className={td}>
                  {e.actor ? (
                    <>
                      <span className="block font-medium">{e.actor.name}</span>
                      <span className="block text-caption text-text-muted">{e.actor.role}</span>
                    </>
                  ) : (
                    <span className="text-text-muted">System or customer</span>
                  )}
                </td>
                <td className={td}>
                  <span className="block font-mono text-caption">{e.action}</span>
                  {e.entityId && (
                    <Link
                      href={`/admin/audit?entityId=${e.entityId}`}
                      className="block font-mono text-caption text-primary-dark"
                    >
                      {e.entityType} {e.entityId}
                    </Link>
                  )}
                </td>
                <td className={cn(td, 'max-w-md text-caption text-text-secondary')}>
                  {summary(e.metadata)}
                  {e.ip && <span className="block text-text-muted">IP {e.ip}</span>}
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
            return `/admin/audit?${n}`;
          }}
        />
      )}
    </div>
  );
}
