import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  BestSellerBadge,
  cn,
  DealBadge,
  NewBadge,
  Price,
  Rating,
  StockBadge,
  type StockState,
} from '@seshakart/ui';
import { ProductImage, type ProductImageData } from './ProductImage';

export type ProductCardBadge = 'NEW' | 'BESTSELLER' | 'DEAL';

export interface ProductCardData {
  slug: string;
  name: string;
  brandName?: string | null;
  image: ProductImageData | null;
  /** Paise. */
  mrp: number;
  /** Paise. */
  price: number;
  /** Real aggregated review data only — omit or 0 when there are no reviews. */
  ratingAvg: number;
  ratingCount: number;
  stock: StockState;
  available?: number;
  badges?: ProductCardBadge[];
}

export interface ProductCardProps {
  product: ProductCardData;
  /** Add-to-cart control (client island, provided by the cart feature). */
  action?: ReactNode;
  /** Wishlist toggle (client island, provided by the wishlist feature). */
  wishlist?: ReactNode;
  priority?: boolean;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}

const badgeFor: Record<ProductCardBadge, () => ReactNode> = {
  DEAL: () => <DealBadge />,
  BESTSELLER: () => <BestSellerBadge />,
  NEW: () => <NewBadge />,
};

/**
 * The SeShaKart product card — reused on the homepage, listings, search, wishlist
 * and recommendations. A server component: only the action/wishlist slots hydrate.
 *
 * The whole card is clickable via a stretched link on the title (one tab stop,
 * one accessible name) while the action buttons stay independently focusable.
 */
export function ProductCard({
  product,
  action,
  wishlist,
  priority,
  headingLevel: H = 'h3',
  className,
}: ProductCardProps) {
  const href = `/product/${product.slug}`;
  const outOfStock = product.stock === 'out_of_stock';

  return (
    <article
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-surface',
        'transition-[box-shadow,border-color] duration-base ease-standard hover:border-border-strong hover:shadow-md',
        'focus-within:border-primary',
        className,
      )}
    >
      <div className="relative">
        <ProductImage
          image={product.image}
          priority={priority}
          className={cn(outOfStock && 'opacity-60')}
        />
        {product.badges && product.badges.length > 0 && (
          <div className="absolute left-2 right-12 top-2 flex flex-col items-start gap-1">
            {product.badges.slice(0, 2).map((b) => (
              <span key={b}>{badgeFor[b]()}</span>
            ))}
          </div>
        )}
        {wishlist && <div className="absolute right-1.5 top-1.5 z-raised">{wishlist}</div>}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 md:p-4">
        {product.brandName && (
          <p className="truncate text-caption font-semibold uppercase tracking-wide text-text-muted">
            {product.brandName}
          </p>
        )}
        <H className="font-body text-product-title">
          <Link
            href={href}
            className="line-clamp-2 text-text-primary no-underline after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none"
          >
            {product.name}
          </Link>
        </H>
        {product.ratingCount > 0 && (
          <Rating value={product.ratingAvg} count={product.ratingCount} />
        )}
        <Price price={product.price} mrp={product.mrp} size="sm" className="mt-auto pt-1" />
        {product.stock !== 'in_stock' && (
          <StockBadge state={product.stock} available={product.available} className="self-start" />
        )}
        {action && <div className="relative z-raised mt-2">{action}</div>}
      </div>
    </article>
  );
}

/** Loading placeholder with the exact footprint of a ProductCard (no layout shift). */
export function ProductCardSkeleton() {
  return (
    <div
      className="flex flex-col overflow-hidden rounded-card border border-border bg-surface"
      aria-hidden="true"
    >
      <div className="aspect-square animate-pulse bg-surface-muted motion-reduce:animate-none" />
      <div className="flex flex-col gap-2 p-3 md:p-4">
        <div className="h-3 w-1/3 rounded-sm bg-surface-muted" />
        <div className="h-4 w-full rounded-sm bg-surface-muted" />
        <div className="h-4 w-2/3 rounded-sm bg-surface-muted" />
        <div className="mt-2 h-5 w-1/2 rounded-sm bg-surface-muted" />
        <div className="mt-2 h-control-sm rounded-button bg-surface-muted" />
      </div>
    </div>
  );
}

/** Responsive product grid: 2 → 3 → 4 → 5 columns. */
export function ProductGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 2xl:grid-cols-5',
        className,
      )}
    >
      {children}
    </div>
  );
}
