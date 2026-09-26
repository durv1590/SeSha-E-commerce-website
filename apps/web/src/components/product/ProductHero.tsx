'use client';

import type { ProductDetail, VariantDto } from '@seshakart/types';
import { Badge, Price, QuantityStepper, Rating, StockBadge, cn } from '@seshakart/ui';
import { BadgeCheck, RotateCcw, Truck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ProductGallery } from './ProductGallery';
import { ShareButton } from './ShareButton';
import { availableValues, optionValues, orderOptionNames, selectValue } from './variant-selection';

const MAX_QTY = 10;

/**
 * Product hero: gallery + purchase panel. Selecting options updates price, stock,
 * images and the URL (?variant=…, shareable) without a page reload.
 */
export function ProductHero({
  product,
  initialVariantId,
}: {
  product: ProductDetail;
  initialVariantId?: string;
}) {
  const initial =
    product.variants.find((v) => v.id === initialVariantId) ??
    product.variants.find((v) => v.id === product.defaultVariantId) ??
    product.variants[0]!;
  const [variant, setVariant] = useState<VariantDto>(initial);
  const [qty, setQty] = useState(1);
  const optionNames = orderOptionNames(product.optionNames);
  const values = optionValues(product.variants, optionNames);

  const choose = (option: string, value: string) => {
    const next = selectValue(product.variants, variant.options, option, value);
    if (!next) return;
    setVariant(next);
    setQty(1);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next.id);
    window.history.replaceState(null, '', url);
  };

  const maxQty = Math.max(1, Math.min(variant.available, MAX_QTY));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2 lg:gap-10">
      <div className="lg:sticky lg:top-40 lg:self-start">
        <ProductGallery
          key={variant.id}
          images={product.images}
          name={product.name}
          preferIds={variant.imageIds}
        />
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          {product.brand && (
            <Link
              href={`/brand/${product.brand.slug}`}
              className="self-start text-small font-semibold uppercase tracking-wide"
            >
              {product.brand.name}
            </Link>
          )}
          <h1 className="text-h2">{product.name}</h1>
          {product.shortDescription && (
            <p className="text-text-secondary">{product.shortDescription}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {product.ratingCount > 0 ? (
              <a href="#reviews" className="no-underline">
                <Rating value={product.ratingAvg} count={product.ratingCount} size="md" />
              </a>
            ) : (
              <span className="text-small text-text-muted">No reviews yet</span>
            )}
            {product.badges.map((b) => (
              <Badge key={b} variant={b === 'DEAL' ? 'deal' : b === 'NEW' ? 'new' : 'bestseller'}>
                {b === 'BESTSELLER' ? 'Bestseller' : b === 'DEAL' ? 'Deal' : 'New'}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1 border-y border-border py-4">
          <Price price={variant.price} mrp={variant.mrp} size="lg" showSavings />
          <p className="text-caption text-text-muted">
            Inclusive of all taxes (GST {product.taxRate}%)
          </p>
        </div>

        {optionNames.map((option) => {
          const allowed = availableValues(product.variants, option, variant.options);
          return (
            <fieldset key={option}>
              <legend className="mb-2 text-small font-semibold">
                {option}:{' '}
                <span className="font-normal text-text-secondary">{variant.options[option]}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {values[option]!.map((value) => {
                  const selected = variant.options[option] === value;
                  // A value can be sold out (the matching variant has no stock) or simply not
                  // offered with the other current choices (choosing it switches those).
                  const candidate = product.variants.find(
                    (v) =>
                      v.options[option] === value &&
                      Object.entries(variant.options).every(
                        ([k, val]) => k === option || v.options[k] === val,
                      ),
                  );
                  const soldOut = Boolean(candidate && candidate.available <= 0);
                  const otherCombo = !candidate && !allowed.has(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => choose(option, value)}
                      className={cn(
                        'min-h-touch rounded-button border px-4 text-small font-medium transition-colors',
                        selected
                          ? 'border-primary bg-primary-light text-primary-dark'
                          : 'border-border-strong bg-surface text-text-primary hover:border-primary',
                        soldOut &&
                          !selected &&
                          'text-text-muted line-through decoration-text-muted',
                        otherCombo && !selected && 'border-dashed text-text-secondary',
                      )}
                    >
                      {value}
                      {soldOut && <span className="sr-only"> (out of stock)</span>}
                      {otherCombo && (
                        <span className="sr-only"> (changes your other selections)</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        <div className="flex flex-wrap items-center gap-4">
          <StockBadge state={variant.stock} available={variant.available} />
          {variant.available > 0 && (
            <QuantityStepper value={qty} onChange={setQty} max={maxQty} itemLabel={product.name} />
          )}
          <span className="text-caption text-text-muted">SKU {variant.sku}</span>
        </div>

        {/* Add to cart and Buy now arrive with the cart (Phase 7). */}

        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-card border border-border bg-surface p-4 text-small sm:grid-cols-3">
          <li className="flex items-start gap-2">
            <Truck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
            <span>
              {product.isCodAvailable ? 'Cash on delivery available' : 'Prepaid orders only'}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <RotateCcw size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
            <span>
              {product.isReturnable ? `${product.returnWindowDays}-day returns` : 'Not returnable'}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <BadgeCheck size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
            <span>Genuine product</span>
          </li>
        </ul>

        <div>
          <ShareButton title={product.name} path={`/product/${product.slug}`} />
        </div>
      </div>
    </div>
  );
}
