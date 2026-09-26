import type { AdminReviewDto } from '@seshakart/types';
import { EmptyState } from '@seshakart/ui';
import { adminReviewListQuerySchema } from '@seshakart/validation';
import { MessageSquareText } from 'lucide-react';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/PageHeader';
import { QueueTabs } from '@/components/admin/QueueTabs';
import { ReviewModeration } from '@/components/admin/engagement/ReviewModeration';
import { Pagination } from '@/components/catalog/Pagination';
import { serverApi } from '@/lib/api/server';
import { requireStaff } from '@/lib/auth/staff';

export const metadata: Metadata = { title: 'Reviews' };

const TABS = [
  ['PENDING', 'To moderate'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['all', 'All'],
] as const;

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireStaff('/admin/reviews', 'reviews:moderate');
  const q = adminReviewListQuerySchema
    .catch(adminReviewListQuerySchema.parse({}))
    .parse(await searchParams);
  const { data, meta } = await serverApi<AdminReviewDto[]>(
    `/admin/reviews?status=${q.status}&page=${q.page}`,
  );
  const href = (status: string, page?: number) =>
    `/admin/reviews?${new URLSearchParams({ ...(status !== 'PENDING' ? { status } : {}), ...(page && page > 1 ? { page: String(page) } : {}) })}`;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Reviews"
        description="Only customers who received a product can review it. Reviews appear on the store once approved."
      />
      <QueueTabs
        label="Review status"
        items={TABS.map(([k, label]) => ({ href: href(k), label, current: q.status === k }))}
      />
      {data.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText size={32} aria-hidden="true" />}
          title={q.status === 'PENDING' ? 'All caught up' : 'No reviews here'}
        />
      ) : (
        <ReviewModeration reviews={data} />
      )}
      {meta && (
        <Pagination
          page={meta.page}
          totalPages={meta.totalPages}
          hrefFor={(p) => href(q.status, p)}
        />
      )}
    </div>
  );
}
