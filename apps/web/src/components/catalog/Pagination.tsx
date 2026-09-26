import { cn } from '@seshakart/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

function pages(current: number, total: number): (number | '…')[] {
  const set = new Set(
    [1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total),
  );
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/** Crawlable numbered pagination (plain links, SEO-friendly). */
export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const base =
    'grid size-control-md place-items-center rounded-button text-small font-semibold no-underline';
  return (
    <nav aria-label="Pagination" className="mt-8 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {page > 1 ? (
            <Link
              href={hrefFor(page - 1)}
              rel="prev"
              aria-label="Previous page"
              className={cn(base, 'text-text-primary hover:bg-surface-muted')}
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(base, 'text-text-muted opacity-40')}>
              <ChevronLeft size={18} />
            </span>
          )}
        </li>
        {pages(page, totalPages).map((p, i) =>
          p === '…' ? (
            <li key={`e${i}`} aria-hidden="true" className="px-1 text-text-muted">
              …
            </li>
          ) : (
            <li key={p}>
              <Link
                href={hrefFor(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  base,
                  p === page
                    ? 'bg-primary text-text-inverse'
                    : 'text-text-primary hover:bg-surface-muted',
                )}
              >
                {p}
              </Link>
            </li>
          ),
        )}
        <li>
          {page < totalPages ? (
            <Link
              href={hrefFor(page + 1)}
              rel="next"
              aria-label="Next page"
              className={cn(base, 'text-text-primary hover:bg-surface-muted')}
            >
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            <span aria-hidden="true" className={cn(base, 'text-text-muted opacity-40')}>
              <ChevronRight size={18} />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
