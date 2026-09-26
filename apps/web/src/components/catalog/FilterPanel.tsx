import type { ProductFacets } from '@seshakart/types';
import { Button, Checkbox, Radio } from '@seshakart/ui';
import Link from 'next/link';

const DISCOUNTS = [10, 20, 30, 40, 50];

/**
 * Filter controls (server-rendered). Category refinement uses links; everything else
 * is a form control inside the surrounding <FilterForm>.
 */
export function FilterPanel({
  facets,
  selected,
  categoryLinks,
  showApply,
  idPrefix,
  moreBrands,
}: {
  /** Unique per rendered copy (desktop sidebar vs mobile sheet). */
  idPrefix: string;
  facets: ProductFacets;
  selected: { brands: string[]; min?: string; max?: string; discount?: string; inStock: boolean };
  /** Sub-category refinement links (href already built by the page). */
  categoryLinks?: { label: string; href: string; count: number }[];
  showApply?: boolean;
  /** Present when only the top brands are listed: links to the full list. */
  moreBrands?: { count: number; href: string };
}) {
  const heading = 'mb-2 text-small font-semibold uppercase tracking-wide text-text-secondary';
  return (
    <div className="flex flex-col divide-y divide-border">
      {categoryLinks && categoryLinks.length > 0 && (
        <section className="pb-4" aria-labelledby={`${idPrefix}-cat`}>
          <h2 id={`${idPrefix}-cat`} className={heading}>
            Category
          </h2>
          <ul className="flex flex-col">
            {categoryLinks.map((c) => (
              <li key={c.href}>
                <Link
                  href={c.href}
                  className="flex min-h-10 items-center justify-between gap-2 rounded-sm px-1 text-small text-text-primary no-underline hover:bg-surface-muted hover:text-primary"
                >
                  {c.label}
                  <span className="text-caption text-text-muted">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {facets.brands.length > 0 && (
        <fieldset className="py-4">
          <legend className={heading}>Brand</legend>
          {facets.brands.map((b) => (
            <Checkbox
              key={b.value}
              name="brand"
              value={b.value}
              defaultChecked={selected.brands.includes(b.value)}
              label={
                <span className="flex w-full justify-between gap-2">
                  {b.label} <span className="text-caption text-text-muted">{b.count}</span>
                </span>
              }
              className="min-h-10 py-1"
            />
          ))}
          {moreBrands && (
            <Link
              href={moreBrands.href}
              scroll={false}
              className="mt-1 inline-flex min-h-10 items-center text-small font-semibold"
            >
              Show all {moreBrands.count} brands
            </Link>
          )}
        </fieldset>
      )}

      <fieldset className="py-4">
        <legend className={heading}>Price (₹)</legend>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${idPrefix}-min`}>
            Minimum price in rupees
          </label>
          <input
            id={`${idPrefix}-min`}
            name="min"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={String(Math.floor(facets.priceRange.min / 100))}
            defaultValue={selected.min}
            className="h-control-sm w-full min-w-0 rounded-input border border-border-strong bg-surface px-2 text-small"
          />
          <span aria-hidden="true" className="text-text-muted">
            –
          </span>
          <label className="sr-only" htmlFor={`${idPrefix}-max`}>
            Maximum price in rupees
          </label>
          <input
            id={`${idPrefix}-max`}
            name="max"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder={String(Math.ceil(facets.priceRange.max / 100))}
            defaultValue={selected.max}
            className="h-control-sm w-full min-w-0 rounded-input border border-border-strong bg-surface px-2 text-small"
          />
          {!showApply && (
            <Button type="submit" size="sm" variant="outline" aria-label="Apply price range">
              Go
            </Button>
          )}
        </div>
      </fieldset>

      <fieldset className="py-4">
        <legend className={heading}>Discount</legend>
        <Radio
          name="discount"
          value=""
          label="Any"
          defaultChecked={!selected.discount}
          className="min-h-10 py-1"
        />
        {DISCOUNTS.map((d) => (
          <Radio
            key={d}
            name="discount"
            value={String(d)}
            label={`${d}% or more`}
            defaultChecked={selected.discount === String(d)}
            className="min-h-10 py-1"
          />
        ))}
      </fieldset>

      <fieldset className="pt-4">
        <legend className={heading}>Availability</legend>
        <Checkbox
          name="inStock"
          value="1"
          label={`In stock only (${facets.inStockCount})`}
          defaultChecked={selected.inStock}
          className="min-h-10 py-1"
        />
      </fieldset>

      {showApply && (
        <div className="sticky bottom-0 mt-4 border-none bg-surface pt-2">
          <Button type="submit" fullWidth>
            Show results
          </Button>
        </div>
      )}
    </div>
  );
}
