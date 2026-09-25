import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type BadgeVariant =
  'neutral' | 'info' | 'discount' | 'deal' | 'new' | 'bestseller' | 'success' | 'warning' | 'error';

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-muted text-text-secondary',
  info: 'bg-primary-light text-primary-dark',
  discount: 'bg-success-light text-success-text',
  deal: 'bg-accent text-navy',
  new: 'bg-primary text-text-inverse',
  bestseller: 'bg-navy text-text-inverse',
  success: 'bg-success-light text-success-text',
  warning: 'bg-warning-light text-warning-text',
  error: 'bg-error-light text-error-text',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-xs px-2 py-1 font-body text-badge uppercase',
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function DiscountBadge({ percent, className }: { percent: number; className?: string }) {
  if (percent <= 0) return null;
  return (
    <Badge variant="discount" className={className}>
      {percent}% off
    </Badge>
  );
}

export type StockState = 'in_stock' | 'low_stock' | 'out_of_stock';

export function StockBadge({
  state,
  available,
  className,
}: {
  state: StockState;
  available?: number;
  className?: string;
}) {
  if (state === 'out_of_stock')
    return (
      <Badge variant="error" className={className}>
        Out of stock
      </Badge>
    );
  if (state === 'low_stock')
    return (
      <Badge variant="warning" className={className}>
        {available ? `Only ${available} left` : 'Few left'}
      </Badge>
    );
  return (
    <Badge variant="success" className={className}>
      In stock
    </Badge>
  );
}

export const NewBadge = ({ className }: { className?: string }) => (
  <Badge variant="new" className={className}>
    New
  </Badge>
);

export const BestSellerBadge = ({ className }: { className?: string }) => (
  <Badge variant="bestseller" className={className}>
    Bestseller
  </Badge>
);

export const DealBadge = ({ className }: { className?: string }) => (
  <Badge variant="deal" className={className}>
    Deal
  </Badge>
);
