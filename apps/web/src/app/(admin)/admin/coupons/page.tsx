import type { AdminCategoryDto, AdminCouponDto } from '@seshakart/types';
import { couponListQuerySchema } from '@seshakart/validation';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { QueueTabs } from '@/components/admin/QueueTabs';
import { CouponManager } from '@/components/admin/ops/CouponManager';
import { Pagination } from '@/components/catalog/Pagination';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Coupons' };

const TABS = [
  ['all', 'All'],
  ['live', 'Live'],
  ['scheduled', 'Scheduled'],
  ['expired', 'Expired'],
  ['inactive', 'Off'],
] as const;

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireStaff('/admin/coupons', 'coupons:write');
  const q = couponListQuerySchema.catch(couponListQuerySchema.parse({})).parse(await searchParams);
  const canReadCategories =
    user.permissions.includes('products:read') || user.permissions.includes('categories:write');
  const [{ data, meta }, categories] = await Promise.all([
    serverApi<AdminCouponDto[]>(`/admin/coupons?state=${q.state}&page=${q.page}`),
    canReadCategories
      ? serverApi<AdminCategoryDto[]>('/admin/categories').then((r) => r.data)
      : Promise.resolve([]),
  ]);
  const href = (state: string, page?: number) =>
    `/admin/coupons?${new URLSearchParams({ ...(state !== 'all' ? { state } : {}), ...(page && page > 1 ? { page: String(page) } : {}) })}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Coupons"
        description="Discount codes shoppers enter in the cart or at checkout."
      />
      <QueueTabs
        label="Coupon status"
        items={TABS.map(([k, label]) => ({ href: href(k), label, current: q.state === k }))}
      />
      <CouponManager coupons={data} categories={categories} />
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => href(q.state, p)}
        />
      )}
    </div>
  );
}
