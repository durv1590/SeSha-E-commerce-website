'use client';

import type { AdminReviewDto } from '@seshakart/types';
import { Badge, Button, FormField, Rating, Textarea, useToast } from '@seshakart/ui';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api/browser';
import { dateTime } from '@/lib/orders/format';
import { FormDialog } from '../FormDialog';

const STATUS = {
  PENDING: { label: 'Pending', badge: 'warning' },
  APPROVED: { label: 'Approved', badge: 'success' },
  REJECTED: { label: 'Rejected', badge: 'neutral' },
} as const;

/** Approve or reject reviews; rejected reviews show the customer your reason. */
export function ReviewModeration({ reviews }: { reviews: AdminReviewDto[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [rejecting, setRejecting] = useState<AdminReviewDto | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const approve = async (r: AdminReviewDto) => {
    setBusy(r.id);
    try {
      await api.post(`/admin/reviews/${r.id}/moderate`, { action: 'approve' });
      toast({ title: 'Review approved and published', variant: 'success' });
      router.refresh();
    } catch {
      toast({ title: 'Couldn’t approve the review. Try again.', variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ul className="flex flex-col gap-3">
        {reviews.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/product/${r.product.slug}`}
                  target="_blank"
                  className="font-medium text-primary-dark"
                >
                  {r.product.name}
                  <span className="sr-only"> (opens in a new tab)</span>
                </Link>
                <p className="text-caption text-text-muted">
                  {r.customer.name}
                  {r.customer.email && ` · ${r.customer.email}`} · {dateTime(r.updatedAt)}
                  {r.isVerifiedPurchase && ' · verified purchase'}
                </p>
              </div>
              <Badge variant={STATUS[r.status].badge}>{STATUS[r.status].label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Rating value={r.rating} showValue={false} />
              <span className="sr-only">{r.rating} out of 5</span>
              {r.title && <span className="font-semibold">{r.title}</span>}
            </div>
            <p className="whitespace-pre-line text-small text-text-primary">{r.body}</p>
            {r.moderatedBy && (
              <p className="text-caption text-text-muted">
                {r.status === 'APPROVED' ? 'Approved' : 'Rejected'} by {r.moderatedBy}
                {r.moderatedAt && ` · ${dateTime(r.moderatedAt)}`}
                {r.moderationNote && ` — “${r.moderationNote}”`}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {r.status !== 'APPROVED' && (
                <Button size="sm" loading={busy === r.id} onClick={() => void approve(r)}>
                  <Check size={14} aria-hidden="true" /> Approve
                  <span className="sr-only">
                    {' '}
                    review of {r.product.name} by {r.customer.name}
                  </span>
                </Button>
              )}
              {r.status !== 'REJECTED' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setNote('');
                    setRejecting(r);
                  }}
                >
                  <X size={14} aria-hidden="true" />{' '}
                  {r.status === 'APPROVED' ? 'Unpublish' : 'Reject'}
                  <span className="sr-only">
                    {' '}
                    review of {r.product.name} by {r.customer.name}
                  </span>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <FormDialog
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title="Reject this review?"
        description="The customer sees your reason and can edit the review and submit it again."
        submitLabel="Reject"
        danger
        onSubmit={async () => {
          if (note.trim().length < 3) return { note: 'Say why the review is rejected' };
          await api.post(`/admin/reviews/${rejecting!.id}/moderate`, {
            action: 'reject',
            note: note.trim(),
          });
          toast({ title: 'Review rejected', variant: 'success' });
          router.refresh();
        }}
      >
        {(e) => (
          <FormField
            label="Reason"
            required
            hint="e.g. Contains personal details, or isn’t about the product"
            error={e.note}
          >
            <Textarea
              name="note"
              value={note}
              rows={3}
              maxLength={300}
              onChange={(ev) => setNote(ev.target.value)}
            />
          </FormField>
        )}
      </FormDialog>
    </>
  );
}
