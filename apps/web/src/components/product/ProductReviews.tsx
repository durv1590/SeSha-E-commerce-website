'use client';

import type { MyReviewDto, PaginationMeta, ReviewDto, ReviewSummaryDto } from '@seshakart/types';
import {
  Alert,
  Badge,
  Button,
  FormField,
  Input,
  Modal,
  Rating,
  Select,
  Textarea,
  cn,
  useToast,
} from '@seshakart/ui';
import { reviewInputSchema } from '@seshakart/validation';
import { BadgeCheck, Star } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useState } from 'react';
import { api, apiRequest, hasSession } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { longDate } from '@/lib/orders/format';

type Sort = 'recent' | 'highest' | 'lowest';

/** Accessible 1–5 star picker (a radio group; arrow keys move between stars). */
export function StarInput({
  value,
  onChange,
  error,
}: {
  value: number;
  onChange: (v: number) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-1.5 text-small font-medium">
        Your rating{' '}
        <span className="text-error-text" aria-hidden="true">
          *
        </span>
      </legend>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="cursor-pointer rounded-sm p-0.5 has-[:focus-visible]:shadow-focus"
          >
            <input
              type="radio"
              name={`${id}-stars`}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <Star
              size={32}
              aria-hidden="true"
              className={n <= value ? 'fill-accent text-accent-text' : 'text-border-strong'}
            />
            <span className="sr-only">
              {n} star{n > 1 ? 's' : ''}
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 text-caption font-medium text-error-text">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Write or edit a review; it's published after moderation. */
export function ReviewDialog({
  open,
  onClose,
  productId,
  productName,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  existing: { rating: number; title: string | null; body: string } | null;
  onSaved: (r: MyReviewDto) => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setRating(existing?.rating ?? 0);
    setTitle(existing?.title ?? '');
    setBody(existing?.body ?? '');
    setErrors({});
    setMessage(null);
  }, [open, existing]);

  const submit = async () => {
    const payload = { productId, rating, title, body };
    const parsed = reviewInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await api.post<MyReviewDto>('/reviews', payload));
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setMessage(err.message);
      } else setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={existing ? 'Edit your review' : 'Write a review'}
      description={productName}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} loadingText="Submitting…" onClick={() => void submit()}>
            Submit review
          </Button>
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {message && <Alert variant="error">{message}</Alert>}
        <StarInput value={rating} onChange={setRating} error={errors.rating} />
        <FormField label="Title" hint="Optional, e.g. “Great battery life”" error={errors.title}>
          <Input
            name="title"
            value={title}
            maxLength={100}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <FormField
          label="Your review"
          required
          hint={`${body.length}/3000 · What did you like or dislike?`}
          error={errors.body}
        >
          <Textarea
            name="body"
            value={body}
            rows={5}
            maxLength={3000}
            onChange={(e) => setBody(e.target.value)}
          />
        </FormField>
        <p className="text-caption text-text-muted">
          Reviews are checked before they appear. Your first name and last initial are shown.
        </p>
      </form>
    </Modal>
  );
}

/** Ratings summary, filters, reviews and "Write a review" on the product page. */
export function ProductReviews({
  slug,
  productId,
  productName,
  initial,
}: {
  slug: string;
  productId: string;
  productName: string;
  initial: { summary: ReviewSummaryDto; reviews: ReviewDto[]; meta: PaginationMeta | undefined };
}) {
  const { toast } = useToast();
  const [reviews, setReviews] = useState(initial.reviews);
  const [meta, setMeta] = useState(initial.meta);
  const [sort, setSort] = useState<Sort>('recent');
  const [star, setStar] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [eligibility, setEligibility] = useState<{
    canReview: boolean;
    review: MyReviewDto | null;
  } | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [writing, setWriting] = useState(false);
  const s = initial.summary;

  useEffect(() => {
    setSignedIn(hasSession());
    if (!hasSession()) return;
    api
      .get<{ canReview: boolean; review: MyReviewDto | null }>(
        `/users/me/reviews/eligibility/${productId}`,
      )
      .then(setEligibility)
      .catch(() => setEligibility(null));
  }, [productId]);

  const load = async (next: { sort: Sort; star: number | null; page: number }) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ sort: next.sort, page: String(next.page), pageSize: '10' });
      if (next.star) qs.set('rating', String(next.star));
      const r = await apiRequest<{ summary: ReviewSummaryDto; reviews: ReviewDto[] }>(
        'GET',
        `/products/${slug}/reviews?${qs}`,
      );
      setReviews((prev) => (next.page === 1 ? r.data.reviews : [...prev, ...r.data.reviews]));
      setMeta(r.meta);
    } finally {
      setLoading(false);
    }
  };

  const mine = eligibility?.review ?? null;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col items-start gap-1">
          {s.count > 0 ? (
            <>
              <p className="text-h1 leading-none tabular-nums">{s.average.toFixed(1)}</p>
              <Rating value={s.average} size="md" showValue={false} />
              <p className="text-small text-text-secondary">
                {s.count} verified review{s.count === 1 ? '' : 's'}
              </p>
            </>
          ) : (
            <p className="text-text-secondary">No reviews yet.</p>
          )}
        </div>
        {s.count > 0 && (
          <ul aria-label="Ratings breakdown" className="flex max-w-sm flex-col gap-1.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const count = s.distribution[n - 1];
              const pct = s.count ? Math.round((count / s.count) * 100) : 0;
              return (
                <li key={n}>
                  <button
                    type="button"
                    aria-pressed={star === n}
                    disabled={!count}
                    onClick={() => {
                      const next = star === n ? null : n;
                      setStar(next);
                      void load({ sort, star: next, page: 1 });
                    }}
                    className={cn(
                      'grid w-full grid-cols-[3.5rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-sm px-1 py-0.5 text-small enabled:hover:bg-surface-muted disabled:cursor-default',
                      star === n && 'bg-primary-light',
                    )}
                  >
                    <span className="text-left">{n} star</span>
                    <span
                      className="h-2 overflow-hidden rounded-full bg-surface-muted"
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-text-secondary">
                      {count}
                      <span className="sr-only"> reviews ({pct}%)</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {signedIn && eligibility?.canReview ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setWriting(true)}>
              {mine ? 'Edit your review' : 'Write a review'}
            </Button>
            {mine && (
              <span className="text-small text-text-secondary">
                Your review is{' '}
                {mine.status === 'PENDING'
                  ? 'waiting for approval'
                  : mine.status === 'APPROVED'
                    ? 'published'
                    : 'not published'}
                .
              </span>
            )}
          </div>
        ) : (
          <p className="text-small text-text-secondary">
            {signedIn ? (
              'Only customers who received this product can review it.'
            ) : (
              <>
                <Link href={`/login?next=${encodeURIComponent(`/product/${slug}#reviews`)}`}>
                  Sign in
                </Link>{' '}
                to review a product you’ve bought.
              </>
            )}
          </p>
        )}
        {s.count > 1 && (
          <label className="flex items-center gap-2 text-small">
            Sort by
            <Select
              size="sm"
              value={sort}
              className="w-auto"
              onChange={(e) => {
                const next = e.target.value as Sort;
                setSort(next);
                void load({ sort: next, star, page: 1 });
              }}
            >
              <option value="recent">Most recent</option>
              <option value="highest">Highest rating</option>
              <option value="lowest">Lowest rating</option>
            </Select>
          </label>
        )}
      </div>

      {reviews.length > 0 && (
        <ul className="flex flex-col divide-y divide-border" aria-busy={loading}>
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-1.5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Rating value={r.rating} showValue={false} />
                {r.title && <p className="font-semibold">{r.title}</p>}
              </div>
              <p className="whitespace-pre-line text-text-primary">{r.body}</p>
              <p className="flex flex-wrap items-center gap-2 text-caption text-text-muted">
                {r.author} · {longDate(r.createdAt)}
                {r.isVerifiedPurchase && (
                  <Badge variant="success">
                    <BadgeCheck size={12} aria-hidden="true" /> Verified purchase
                  </Badge>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
      {meta && meta.page < meta.totalPages && (
        <Button
          variant="outline"
          className="self-start"
          loading={loading}
          onClick={() => void load({ sort, star, page: meta.page + 1 })}
        >
          Show more reviews
        </Button>
      )}

      <ReviewDialog
        open={writing}
        onClose={() => setWriting(false)}
        productId={productId}
        productName={productName}
        existing={mine}
        onSaved={(r) => {
          setEligibility((e) => (e ? { ...e, review: r } : e));
          toast({
            title: 'Thanks! Your review will appear once it’s approved.',
            variant: 'success',
          });
        }}
      />
    </div>
  );
}
