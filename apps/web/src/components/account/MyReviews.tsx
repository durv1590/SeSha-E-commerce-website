'use client';

import type { MyReviewDto, ReviewablePurchaseDto } from '@seshakart/types';
import { Alert, Badge, Button, EmptyState, Rating, Skeleton, useToast } from '@seshakart/ui';
import { MessageSquareText } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api/browser';
import { longDate } from '@/lib/orders/format';
import { ConfirmDialog } from '../admin/ConfirmDialog';
import { ReviewDialog } from '../product/ProductReviews';

const STATUS = {
  PENDING: { label: 'Waiting for approval', badge: 'warning' },
  APPROVED: { label: 'Published', badge: 'success' },
  REJECTED: { label: 'Not published', badge: 'neutral' },
} as const;

type Writing = { productId: string; name: string; existing: MyReviewDto | null };

/** The customer's reviews, and delivered products waiting for one. */
export function MyReviews() {
  const { toast } = useToast();
  const [data, setData] = useState<{
    reviews: MyReviewDto[];
    awaiting: ReviewablePurchaseDto[];
  } | null>(null);
  const [error, setError] = useState(false);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [deleting, setDeleting] = useState<MyReviewDto | null>(null);

  const load = useCallback(() => {
    api
      .get<{ reviews: MyReviewDto[]; awaiting: ReviewablePurchaseDto[] }>('/users/me/reviews')
      .then(setData)
      .catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  if (error)
    return <Alert variant="error">We couldn’t load your reviews. Please refresh the page.</Alert>;
  if (!data) return <Skeleton className="h-48 w-full" aria-label="Loading your reviews" />;

  return (
    <div className="flex flex-col gap-8">
      {data.awaiting.length > 0 && (
        <section aria-labelledby="awaiting-h" className="flex flex-col gap-3">
          <h2 id="awaiting-h" className="text-h4">
            Review your purchases
          </h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
            {data.awaiting.map((a) => (
              <li
                key={a.productId}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
              >
                <span className="relative block size-14 shrink-0 overflow-hidden rounded-sm border border-border bg-surface">
                  {a.imageUrl && (
                    <Image
                      src={a.imageUrl}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-contain p-1"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 text-small">
                  <Link
                    href={`/product/${a.slug}`}
                    className="line-clamp-2 font-medium text-text-primary"
                  >
                    {a.name}
                  </Link>
                  <span className="text-text-muted">Delivered {longDate(a.deliveredAt)}</span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setWriting({ productId: a.productId, name: a.name, existing: null })
                  }
                >
                  Review<span className="sr-only"> {a.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mine-h" className="flex flex-col gap-3">
        <h2 id="mine-h" className="text-h4">
          Your reviews
        </h2>
        {data.reviews.length === 0 ? (
          <EmptyState
            icon={<MessageSquareText size={32} aria-hidden="true" />}
            title="No reviews yet"
            description="You can review products after they’re delivered."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {data.reviews.map((r) => (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <Link
                    href={`/product/${r.product.slug}`}
                    className="font-medium text-text-primary"
                  >
                    {r.product.name}
                  </Link>
                  <Badge variant={STATUS[r.status].badge}>{STATUS[r.status].label}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Rating value={r.rating} showValue={false} />
                  {r.title && <span className="font-semibold">{r.title}</span>}
                </div>
                <p className="whitespace-pre-line text-small text-text-secondary">{r.body}</p>
                {r.status === 'REJECTED' && r.moderationNote && (
                  <Alert variant="warning" title="Why it wasn’t published">
                    {r.moderationNote} You can edit the review and submit it again.
                  </Alert>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setWriting({ productId: r.product.id, name: r.product.name, existing: r })
                    }
                  >
                    Edit<span className="sr-only"> review of {r.product.name}</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(r)}>
                    Delete<span className="sr-only"> review of {r.product.name}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReviewDialog
        open={Boolean(writing)}
        onClose={() => setWriting(null)}
        productId={writing?.productId ?? ''}
        productName={writing?.name ?? ''}
        existing={writing?.existing ?? null}
        onSaved={() => {
          toast({
            title: 'Thanks! Your review will appear once it’s approved.',
            variant: 'success',
          });
          load();
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this review?"
        confirmLabel="Delete"
        danger
        onConfirm={async () => {
          await api.delete(`/reviews/${deleting!.id}`);
          toast({ title: 'Review deleted', variant: 'success' });
          load();
        }}
      />
    </div>
  );
}
