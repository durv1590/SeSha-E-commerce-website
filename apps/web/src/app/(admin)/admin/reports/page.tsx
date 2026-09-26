import type { SalesReportDto } from '@seshakart/types';
import { buttonVariants, cn, formatINR } from '@seshakart/ui';
import { salesReportQuerySchema } from '@seshakart/validation';
import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import { AdminTable, td, th } from '@/components/admin/AdminTable';
import { PageHeader } from '@/components/admin/PageHeader';
import { QueueTabs } from '@/components/admin/QueueTabs';
import { SalesChart } from '@/components/admin/SalesChart';
import { reportPresets } from '@/lib/admin/periods';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';
import { longDate } from '@/lib/orders/format';

export const metadata: Metadata = { title: 'Reports' };

const control =
  'h-control-md w-full rounded-input border border-border-strong bg-surface px-3 text-small focus:border-primary focus:shadow-focus focus:outline-none';
const monthLabel = (p: string) =>
  new Date(`${p}-15T12:00:00+05:30`).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff('/admin/reports', 'analytics:read');
  const sp = await searchParams;
  const presets = reportPresets();
  const fallback = presets.find((p) => p.key === '30d')!;
  const parsed = salesReportQuerySchema.safeParse({
    from: sp.from ?? fallback.from,
    to: sp.to ?? fallback.to,
    groupBy: sp.groupBy,
  });
  const q = parsed.success
    ? parsed.data
    : { from: fallback.from, to: fallback.to, groupBy: 'day' as const };
  const qs = new URLSearchParams({ from: q.from, to: q.to, groupBy: q.groupBy });
  const { data: r } = await serverApi<SalesReportDto>(`/admin/reports/sales?${qs}`);
  const t = r.totals;
  const tiles = [
    ['Net sales', formatINR(t.netSales), 'Order totals minus refunds paid'],
    ['Orders', String(t.orders), `${t.units} units`],
    [
      'Average order',
      t.orders ? formatINR(Math.round((t.netSales + t.refunds) / t.orders)) : '—',
      'Before refunds',
    ],
    ['Refunds paid', formatINR(t.refunds), ''],
  ];
  const label = (p: string) =>
    r.groupBy === 'month' ? monthLabel(p) : longDate(`${p}T12:00:00+05:30`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Sales report"
        description="Confirmed orders (cancellations excluded) by the day they were placed, India time. Refunds count on the day they were paid."
        actions={
          <a
            href={`/api/admin/reports/sales.csv?${qs}`}
            download
            className={buttonVariants({ variant: 'outline', size: 'md' })}
          >
            <Download size={16} aria-hidden="true" /> Export CSV
          </a>
        }
      />
      <QueueTabs
        label="Report period"
        items={presets.map((p) => ({
          href: `/admin/reports?${new URLSearchParams({ from: p.from, to: p.to, groupBy: p.key === 'fy' ? 'month' : 'day' })}`,
          label: p.label,
          current: p.from === q.from && p.to === q.to,
        }))}
      />
      <form
        method="get"
        aria-label="Custom period"
        className="grid grid-cols-2 gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-[repeat(3,minmax(0,12rem))_auto]"
      >
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          From
          <input type="date" name="from" defaultValue={q.from} className={control} required />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          To
          <input type="date" name="to" defaultValue={q.to} className={control} required />
        </label>
        <label className="flex flex-col gap-1 text-caption font-medium text-text-secondary">
          Group by
          <select name="groupBy" defaultValue={q.groupBy} className={control}>
            <option value="day">Day</option>
            <option value="month">Month</option>
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" className={buttonVariants({ size: 'md' })}>
            Show
          </button>
        </div>
      </form>
      {!parsed.success && (
        <p role="alert" className="text-small text-error-text">
          {parsed.error.issues[0]?.message ?? 'That period isn’t valid'}; showing the last 30 days.
        </p>
      )}

      <section aria-label="Totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([k, v, hint]) => (
          <div key={k} className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-text-secondary">{k}</p>
            <p className="text-h3 tabular-nums">{v}</p>
            {hint && <p className="text-caption text-text-muted">{hint}</p>}
          </div>
        ))}
      </section>

      {r.groupBy === 'day' && r.rows.length <= 92 && (
        <div className="rounded-card border border-border bg-surface p-4">
          <SalesChart
            title={`Net sales by day, ${longDate(`${r.from}T12:00:00+05:30`)} – ${longDate(`${r.to}T12:00:00+05:30`)}`}
            data={r.rows.map((x) => ({
              date: x.period,
              revenue: Math.max(0, x.netSales),
              orders: x.orders,
            }))}
          />
        </div>
      )}

      <AdminTable label={`Sales by ${r.groupBy}`}>
        <thead className="border-b border-border bg-surface-muted">
          <tr>
            <th scope="col" className={th}>
              {r.groupBy === 'day' ? 'Day' : 'Month'}
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Orders
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Units
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Items
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Discounts
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Delivery &amp; COD fees
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              GST included
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Refunds
            </th>
            <th scope="col" className={cn(th, 'text-right')}>
              Net sales
            </th>
          </tr>
        </thead>
        <tbody>
          {[...r.rows].reverse().map((x) => (
            <tr key={x.period} className="border-t border-border">
              <th scope="row" className={cn(td, 'whitespace-nowrap text-left font-normal')}>
                {label(x.period)}
              </th>
              <td className={cn(td, 'text-right tabular-nums')}>{x.orders}</td>
              <td className={cn(td, 'text-right tabular-nums')}>{x.units}</td>
              <td className={cn(td, 'text-right tabular-nums')}>{formatINR(x.grossSales)}</td>
              <td className={cn(td, 'text-right tabular-nums')}>
                {x.discounts ? `− ${formatINR(x.discounts)}` : '—'}
              </td>
              <td className={cn(td, 'text-right tabular-nums')}>{formatINR(x.shipping)}</td>
              <td className={cn(td, 'text-right tabular-nums')}>{formatINR(x.tax)}</td>
              <td className={cn(td, 'text-right tabular-nums')}>
                {x.refunds ? `− ${formatINR(x.refunds)}` : '—'}
              </td>
              <td className={cn(td, 'text-right font-medium tabular-nums')}>
                {formatINR(x.netSales)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-border-strong bg-surface-muted font-semibold">
          <tr>
            <th scope="row" className={cn(td, 'text-left')}>
              Total
            </th>
            <td className={cn(td, 'text-right tabular-nums')}>{t.orders}</td>
            <td className={cn(td, 'text-right tabular-nums')}>{t.units}</td>
            <td className={cn(td, 'text-right tabular-nums')}>{formatINR(t.grossSales)}</td>
            <td className={cn(td, 'text-right tabular-nums')}>
              {t.discounts ? `− ${formatINR(t.discounts)}` : '—'}
            </td>
            <td className={cn(td, 'text-right tabular-nums')}>{formatINR(t.shipping)}</td>
            <td className={cn(td, 'text-right tabular-nums')}>{formatINR(t.tax)}</td>
            <td className={cn(td, 'text-right tabular-nums')}>
              {t.refunds ? `− ${formatINR(t.refunds)}` : '—'}
            </td>
            <td className={cn(td, 'text-right tabular-nums')}>{formatINR(t.netSales)}</td>
          </tr>
        </tfoot>
      </AdminTable>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <section aria-labelledby="pay-h" className="flex flex-col gap-3">
          <h2 id="pay-h" className="text-h4">
            By payment method
          </h2>
          {r.byPayment.length === 0 ? (
            <p className="text-small text-text-muted">No sales in this period.</p>
          ) : (
            <AdminTable label="Sales by payment method" className="[&_table]:min-w-0">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <th scope="col" className={th}>
                    Method
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Orders
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Order value
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.byPayment.map((p) => (
                  <tr key={p.method} className="border-t border-border first:border-t-0">
                    <th scope="row" className={cn(td, 'text-left font-normal')}>
                      {p.method === 'COD' ? 'Cash on delivery' : 'Paid online'}
                    </th>
                    <td className={cn(td, 'text-right tabular-nums')}>{p.orders}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{formatINR(p.netSales)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          )}
        </section>
        <section aria-labelledby="cat-h" className="flex flex-col gap-3">
          <h2 id="cat-h" className="text-h4">
            Top categories
          </h2>
          {r.byCategory.length === 0 ? (
            <p className="text-small text-text-muted">No sales in this period.</p>
          ) : (
            <AdminTable label="Sales by category" className="[&_table]:min-w-0">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <th scope="col" className={th}>
                    Category
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Units
                  </th>
                  <th scope="col" className={cn(th, 'text-right')}>
                    Item sales
                  </th>
                </tr>
              </thead>
              <tbody>
                {r.byCategory.map((c) => (
                  <tr key={c.category} className="border-t border-border first:border-t-0">
                    <th scope="row" className={cn(td, 'text-left font-normal')}>
                      {c.category}
                    </th>
                    <td className={cn(td, 'text-right tabular-nums')}>{c.units}</td>
                    <td className={cn(td, 'text-right tabular-nums')}>{formatINR(c.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
          )}
        </section>
      </div>
    </div>
  );
}
