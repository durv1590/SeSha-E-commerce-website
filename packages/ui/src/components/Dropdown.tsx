'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DropdownItem {
  label: string;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
}

export interface DropdownMenuProps {
  /** Visible trigger content. */
  trigger: ReactNode;
  /** Accessible name when the trigger is icon-only. */
  triggerLabel?: string;
  items: DropdownItem[];
  align?: 'start' | 'end';
  triggerClassName?: string;
}

/** Menu button following the WAI-ARIA menu pattern (arrow keys, Home/End, Escape). */
export function DropdownMenu({
  trigger,
  triggerLabel,
  items,
  align = 'start',
  triggerClassName,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  const focusItem = (index: number) => {
    const count = items.length;
    itemRefs.current[((index % count) + count) % count]?.focus();
  };

  const openAt = (index: number) => {
    setOpen(true);
    requestAnimationFrame(() => focusItem(index));
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openAt(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openAt(items.length - 1);
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const current = itemRefs.current.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(items.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  const itemClass = (danger?: boolean) =>
    cn(
      'flex min-h-touch w-full items-center gap-3 rounded-sm px-3 text-left text-small outline-none',
      'hover:bg-surface-muted focus:bg-primary-light focus:text-primary-dark',
      danger ? 'text-error-text' : 'text-text-primary',
    );

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        onClick={() => (open ? close() : openAt(0))}
        onKeyDown={onTriggerKey}
        className={cn(
          'inline-flex items-center gap-2 rounded-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className={cn(
            'absolute top-full z-dropdown mt-2 min-w-52 rounded-md border border-border bg-surface p-1.5 shadow-lg animate-fade-in',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, i) =>
            item.href ? (
              <a
                key={item.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                tabIndex={-1}
                href={item.href}
                className={itemClass(item.danger)}
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
              >
                {item.icon}
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={itemClass(item.danger)}
                onClick={() => {
                  item.onSelect?.();
                  close();
                }}
              >
                {item.icon}
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
