import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Placeholder block with a subtle shimmer (disabled for reduced-motion users). */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden rounded-md bg-surface-muted',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-surface/60 after:to-transparent',
        'motion-reduce:after:hidden',
        className,
      )}
      {...rest}
    />
  );
}
