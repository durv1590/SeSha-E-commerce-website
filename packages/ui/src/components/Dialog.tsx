'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Visually hide the title (it is still announced to screen readers). */
  hideTitle?: boolean;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

interface InternalProps extends DialogProps {
  kind: 'modal' | 'drawer';
  side?: 'left' | 'right' | 'bottom';
  size?: 'sm' | 'md' | 'lg';
}

const modalSizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' };

const drawerSides = {
  right: 'ml-auto mr-0 h-dvh max-h-none w-[min(26rem,90vw)] animate-slide-in-right',
  left: 'ml-0 mr-auto h-dvh max-h-none w-[min(22rem,88vw)] animate-slide-in-left',
  bottom: 'mb-0 mt-auto max-h-[88dvh] w-full max-w-none rounded-t-xl animate-slide-up',
};

/**
 * Accessible dialog built on the native <dialog> element: the browser provides the
 * focus trap, inert background, Escape handling and top-layer stacking — no library.
 */
function DialogBase({
  open,
  onClose,
  title,
  hideTitle,
  description,
  children,
  footer,
  className,
  kind,
  side = 'right',
  size = 'md',
}: InternalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const previouslyFocused = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const root = document.documentElement;
      const prevOverflow = root.style.overflow;
      root.style.overflow = 'hidden';
      return () => {
        root.style.overflow = prevOverflow;
        if (dialog.open) dialog.close();
        previouslyFocused?.focus?.();
      };
    }
  }, [open]);

  return (
    // Backdrop click is a pointer convenience; keyboard users close with Escape (onCancel)
    // or the labelled Close button, so no extra key handler is needed here.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the <dialog> element itself (not its content) is a backdrop click.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'z-modal bg-surface p-0 text-text-primary shadow-lg backdrop:bg-navy/55 backdrop:animate-fade-in',
        kind === 'modal' && cn('w-[calc(100%-2rem)] rounded-xl animate-slide-up', modalSizes[size]),
        kind === 'drawer' && drawerSides[side],
        className,
      )}
    >
      {open && (
        <div className="flex h-full max-h-[inherit] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div>
              <h2 id={titleId} className={cn('font-heading text-h4', hideTitle && 'sr-only')}>
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-small text-text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 grid size-control-md shrink-0 place-items-center rounded-pill text-text-secondary hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
            >
              <svg viewBox="0 0 20 20" className="size-5" fill="currentColor" aria-hidden="true">
                <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4z" />
              </svg>
            </button>
          </header>
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <footer className="border-t border-border px-5 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function Modal(props: DialogProps & { size?: 'sm' | 'md' | 'lg' }) {
  return <DialogBase {...props} kind="modal" />;
}

/** Side sheet: navigation drawer (left), cart/filters (right) or mobile sheet (bottom). */
export function Drawer(props: DialogProps & { side?: 'left' | 'right' | 'bottom' }) {
  return <DialogBase {...props} kind="drawer" />;
}
