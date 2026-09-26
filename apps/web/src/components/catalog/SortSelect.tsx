'use client';

import { PRODUCT_SORT_LABELS, type ProductSort } from '@seshakart/validation';
import { useRouter } from 'next/navigation';

const OPTIONS: ProductSort[] = ['popular', 'newest', 'price_asc', 'price_desc', 'discount'];

/** Sort control: changes the URL (keeps filters, resets to page 1). */
export function SortSelect({ value, hrefFor }: { value: string; hrefFor: Record<string, string> }) {
  const router = useRouter();
  return (
    <label className="flex min-w-0 items-center gap-2 text-small">
      <span className="hidden text-text-muted sm:inline">Sort by</span>
      <select
        aria-label="Sort products"
        value={value}
        onChange={(e) => router.push(hrefFor[e.target.value]!, { scroll: false })}
        className="h-control-sm w-full min-w-0 max-w-48 rounded-input border border-border-strong bg-surface pl-3 pr-8 text-small"
      >
        {OPTIONS.map((o) => (
          <option key={o} value={o}>
            {PRODUCT_SORT_LABELS[o]}
          </option>
        ))}
      </select>
    </label>
  );
}
