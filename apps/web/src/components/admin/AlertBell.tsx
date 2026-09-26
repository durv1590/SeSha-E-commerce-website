'use client';

import type { AdminAlertDto } from '@seshakart/types';
import { cn } from '@seshakart/ui';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api/browser';

const POLL_MS = 60_000;

/**
 * "Needs attention" bell: counts of work waiting (orders to ship, returns, reviews,
 * stock…) for what this staff member can act on. Refreshed every minute and after
 * each navigation.
 */
export function AlertBell() {
  const [alerts, setAlerts] = useState<AdminAlertDto[] | null>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const load = useCallback(() => {
    if (document.visibilityState === 'hidden') return;
    api
      .get<AdminAlertDto[]>('/admin/alerts')
      .then(setAlerts)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, pathname]);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const total = alerts?.reduce((s, a) => s + a.count, 0) ?? 0;
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="admin-alerts"
        aria-label={
          total
            ? `Needs attention: ${total} item${total === 1 ? '' : 's'}`
            : 'Needs attention: nothing waiting'
        }
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-10 place-items-center rounded-md hover:bg-surface-muted"
      >
        <Bell size={20} aria-hidden="true" />
        {total > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-error px-1 text-center text-[11px] font-bold leading-5 text-text-inverse"
          >
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>
      {open && (
        <div
          id="admin-alerts"
          className="absolute right-0 top-12 z-dropdown w-72 max-w-[calc(100vw-2rem)] rounded-card border border-border bg-surface p-2 shadow-lg"
        >
          <p className="px-2 pb-1 pt-1 text-caption font-semibold uppercase tracking-wide text-text-muted">
            Needs attention
          </p>
          {!alerts?.length ? (
            <p className="px-2 py-3 text-small text-text-secondary">
              All caught up. Nothing is waiting.
            </p>
          ) : (
            <ul>
              {alerts.map((a) => (
                <li key={a.key}>
                  <Link
                    href={a.href}
                    className="flex min-h-10 items-center justify-between gap-3 rounded-md px-2 text-small font-medium text-text-primary no-underline hover:bg-surface-muted"
                  >
                    {a.label}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-caption font-semibold tabular-nums',
                        a.tone === 'warning'
                          ? 'bg-warning-light text-warning-text'
                          : 'bg-primary-light text-primary-dark',
                      )}
                    >
                      {a.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
