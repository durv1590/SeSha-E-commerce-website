'use client';

import { cn } from '../lib/cn';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Product name, so screen readers announce "Increase quantity of Wireless Earbuds". */
  itemLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  disabled,
  itemLabel,
  size = 'md',
  className,
}: QuantityStepperProps) {
  const suffix = itemLabel ? ` of ${itemLabel}` : '';
  const btn = cn(
    'grid place-items-center text-text-primary transition-colors duration-fast hover:bg-surface-muted',
    'disabled:cursor-not-allowed disabled:opacity-40',
    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
    size === 'sm' ? 'size-control-sm' : 'size-control-md',
  );
  return (
    <div
      className={cn(
        'inline-flex items-center overflow-hidden rounded-button border border-border-strong bg-surface',
        className,
      )}
      role="group"
      aria-label={`Quantity${suffix}`}
    >
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label={`Decrease quantity${suffix}`}
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
          <rect x="4" y="9" width="12" height="2" rx="1" />
        </svg>
      </button>
      <output className="min-w-8 text-center font-semibold tabular-nums" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className={btn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label={`Increase quantity${suffix}`}
      >
        <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
          <rect x="4" y="9" width="12" height="2" rx="1" />
          <rect x="9" y="4" width="2" height="12" rx="1" />
        </svg>
      </button>
    </div>
  );
}
