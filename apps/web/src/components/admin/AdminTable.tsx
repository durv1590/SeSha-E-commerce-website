import { cn } from '@seshakart/ui';
import type { ReactNode } from 'react';

/**
 * A data table that scrolls sideways on small screens. The scroll container is
 * focusable and labelled so keyboard users can scroll it too, and positioned so
 * visually hidden (absolutely positioned) text inside can't widen the page.
 */
export function AdminTable({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        'relative overflow-x-auto rounded-card border border-border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        className,
      )}
    >
      <table className="w-full min-w-[40rem] text-small">
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}

export const th = 'px-3 py-2.5 text-left font-semibold text-text-secondary whitespace-nowrap';
export const td = 'px-3 py-2.5 align-middle';
