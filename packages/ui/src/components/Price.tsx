import { cn } from '../lib/cn';
import { discountPercent, formatINR } from '../lib/format';

export interface PriceProps {
  /** Selling price in paise. */
  price: number;
  /** Maximum retail price in paise (inclusive of all taxes). */
  mrp?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Show "You save ₹X" below (product page). */
  showSavings?: boolean;
  className?: string;
}

const priceSize = { sm: 'text-h5 font-bold', md: 'text-price', lg: 'text-price-lg' };

/**
 * Selling price, struck-through MRP and discount. Screen readers hear
 * "Price ₹999, MRP ₹1,499, 33% off" rather than two unexplained numbers.
 */
export function Price({ price, mrp, size = 'md', showSavings, className }: PriceProps) {
  const off = mrp ? discountPercent(mrp, price) : 0;
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={cn('font-heading tabular-nums text-text-primary', priceSize[size])}>
          <span className="sr-only">Price </span>
          {formatINR(price)}
        </span>
        {off > 0 && mrp && (
          <>
            <span className="text-small tabular-nums text-text-muted">
              <span className="sr-only">MRP </span>
              <s>{formatINR(mrp)}</s>
            </span>
            <span className="text-discount text-success-text">{off}% off</span>
          </>
        )}
      </div>
      {showSavings && off > 0 && mrp && (
        <p className="text-small font-medium text-success-text">
          You save {formatINR(mrp - price)}
        </p>
      )}
    </div>
  );
}
