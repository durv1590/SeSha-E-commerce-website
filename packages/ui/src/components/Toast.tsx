'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Errors stay a little longer by default. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastApi {
  toast: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const variantStyles: Record<ToastVariant, string> = {
  info: 'border-l-primary',
  success: 'border-l-success',
  error: 'border-l-error',
};

/** Global, non-blocking notifications announced to screen readers via live regions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setItems((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-2), { ...options, id }]);
      const duration = options.duration ?? (options.variant === 'error' ? 7000 : 4000);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-toast flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end"
        aria-live="polite"
        aria-relevant="additions"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.variant === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-md border border-l-4 border-border bg-surface p-3.5 shadow-lg animate-slide-up',
              variantStyles[t.variant ?? 'info'],
            )}
          >
            <div className="flex-1">
              <p className="text-small font-semibold text-text-primary">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-small text-text-muted">{t.description}</p>
              )}
            </div>
            {t.action && (
              <button
                type="button"
                className="text-small font-semibold text-primary hover:underline"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-m-1 grid size-8 place-items-center rounded-pill text-text-muted hover:bg-surface-muted"
            >
              <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden="true">
                <path d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
