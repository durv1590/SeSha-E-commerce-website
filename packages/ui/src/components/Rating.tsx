import { useId } from 'react';
import { cn } from '../lib/cn';
import { formatCount } from '../lib/format';

export interface RatingProps {
  value: number;
  count?: number;
  size?: 'sm' | 'md';
  /** Show the numeric value next to the stars. */
  showValue?: boolean;
  className?: string;
}

const STAR = 'M12 2.5l2.95 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.7l-6.15 3.4 1.4-6.8-5.1-4.7 6.9-.8z';

/** Read-only star rating. Only real, aggregated review data may be passed in. */
export function Rating({ value, count, size = 'sm', showValue = true, className }: RatingProps) {
  // SVG url(#…) references need a plain id; React's ids contain characters like «».
  const id = `rating${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const clamped = Math.max(0, Math.min(5, value));
  const px = size === 'sm' ? 14 : 18;
  const viewWidth = 5 * 24 + 8; // five 24-unit stars with 2-unit gaps
  // The fill boundary is measured across the whole row, so 4.3 fills four stars
  // fully and the fifth by 30%.
  const starIndex = Math.floor(clamped);
  const fillX = starIndex * 26 + (clamped - starIndex) * 24;
  const label =
    count !== undefined
      ? `Rated ${clamped.toFixed(1)} out of 5 from ${count.toLocaleString('en-IN')} ${count === 1 ? 'review' : 'reviews'}`
      : `Rated ${clamped.toFixed(1)} out of 5`;

  return (
    <div
      className={cn('inline-flex items-center gap-1.5', className)}
      role="img"
      aria-label={label}
    >
      <svg
        width={Math.round((viewWidth / 24) * px)}
        height={px}
        viewBox={`0 0 ${viewWidth} 24`}
        aria-hidden="true"
      >
        <defs>
          <clipPath id={id}>
            <rect x="0" y="0" width={fillX} height="24" />
          </clipPath>
        </defs>
        {/* Grey stars, then the accent stars clipped to the rating. The clip lives on an
            untransformed group, so its width is measured across the whole row. */}
        <g fill="rgb(var(--color-border-strong))">
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={STAR} transform={`translate(${i * 26} 0)`} />
          ))}
        </g>
        <g fill="rgb(var(--color-accent))" clipPath={`url(#${id})`} data-fill-width={fillX}>
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={STAR} transform={`translate(${i * 26} 0)`} />
          ))}
        </g>
      </svg>
      {showValue && (
        <span aria-hidden="true" className="text-small font-semibold text-text-primary">
          {clamped.toFixed(1)}
        </span>
      )}
      {count !== undefined && (
        <span aria-hidden="true" className="text-small text-text-muted">
          ({formatCount(count)})
        </span>
      )}
    </div>
  );
}
