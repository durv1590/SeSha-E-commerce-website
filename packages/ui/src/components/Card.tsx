import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover elevation for cards that are fully clickable. */
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = { none: '', sm: 'p-3', md: 'p-4 md:p-5', lg: 'p-5 md:p-7' };

export function Card({ interactive, padding = 'md', className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-surface',
        paddings[padding],
        interactive &&
          'transition-[box-shadow,border-color] duration-base ease-standard hover:border-border-strong hover:shadow-md',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-3 flex items-center justify-between gap-3', className)} {...rest} />
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('font-heading text-h4 text-text-primary', className)} {...rest}>
      {children}
    </h3>
  );
}
