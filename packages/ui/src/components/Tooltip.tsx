'use client';

import { cloneElement, useId, useState, type ReactElement } from 'react';
import { cn } from '../lib/cn';

export interface TooltipProps {
  content: string;
  /** A single focusable element (e.g. an icon button). */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: 'top' | 'bottom';
}

/**
 * Supplementary hint shown on hover AND keyboard focus, dismissible with Escape
 * (WCAG 1.4.13). Never put essential information only in a tooltip.
 */
export function Tooltip({ content, children, side = 'top' }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    // Hover/focus handlers only toggle a supplementary hint; the child stays the interactive element.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      <span
        id={id}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-tooltip w-max max-w-56 -translate-x-1/2 rounded-sm bg-navy px-2.5 py-1.5 text-caption text-text-inverse shadow-md',
          side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          open ? 'visible opacity-100' : 'invisible opacity-0',
          'transition-opacity duration-fast',
        )}
      >
        {content}
      </span>
    </span>
  );
}
