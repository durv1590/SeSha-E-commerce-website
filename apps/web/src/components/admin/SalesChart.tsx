'use client';

import { cn, formatINR } from '@seshakart/ui';
import { useId, useRef, useState, type KeyboardEvent } from 'react';

interface Point {
  date: string;
  revenue: number;
  orders: number;
}

const day = (iso: string, withWeekday = false) =>
  new Date(`${iso}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    ...(withWeekday ? { weekday: 'short' } : {}),
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });

/** Axis maximum whose quarter ticks are round numbers: 1, 2, 4, 6 or 8 × a power of ten. */
function niceMax(v: number): number {
  if (v <= 0) return 100_000; // ₹1,000 so an empty chart still has an axis
  const exp = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

const compact = (paise: number) => {
  const r = paise / 100;
  if (r >= 1_00_00_000) return `₹${(r / 1_00_00_000).toFixed(r % 1_00_00_000 ? 1 : 0)} Cr`;
  if (r >= 1_00_000) return `₹${(r / 1_00_000).toFixed(r % 1_00_000 ? 1 : 0)} L`;
  if (r >= 1_000) return `₹${(r / 1_000).toFixed(r % 1_000 ? 1 : 0)}K`;
  return `₹${r}`;
};

/**
 * Daily sales (single series, one brand hue, no legend: the title names it).
 * Bars ≤ 24px with 4px rounded tops and 2px gaps; hairline grid on clean ticks;
 * per-bar tooltip on hover and on keyboard focus (←/→), and a table view so no value
 * depends on hovering.
 */
export function SalesChart({ data, title }: { data: Point[]; title: string }) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const plot = useRef<HTMLDivElement>(null);
  const max = niceMax(Math.max(...data.map((d) => d.revenue)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const best = data.reduce((b, d, i) => (d.revenue > data[b]!.revenue ? i : b), 0);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActive((a) => {
        const cur = a ?? (e.key === 'ArrowRight' ? -1 : data.length);
        return Math.min(data.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    }
    if (e.key === 'Home') setActive(0);
    if (e.key === 'End') setActive(data.length - 1);
    if (e.key === 'Escape') setActive(null);
  };

  const a = active !== null ? data[active] : null;
  return (
    <figure className="flex flex-col gap-3" aria-labelledby={`${id}-title`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption id={`${id}-title`} className="text-h5">
          {title}
        </figcaption>
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
          className="text-small font-semibold text-primary-dark hover:underline"
        >
          {table ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {table ? (
        <div
          tabIndex={0}
          role="region"
          aria-label={`${title}, table`}
          className="max-h-80 overflow-auto rounded-md border border-border outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <table className="w-full text-small">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-surface-muted text-left">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Day
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Sales
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Orders
                </th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date} className="border-t border-border">
                  <th scope="row" className="px-3 py-1.5 text-left font-normal">
                    {day(d.date, true)}
                  </th>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(d.revenue)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{d.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 pt-3">
          {/* y-axis ticks (text tokens, never the series colour) */}
          <div
            className="relative h-56 w-12 text-right text-caption text-text-muted"
            aria-hidden="true"
          >
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 -translate-y-1/2 tabular-nums"
                style={{ bottom: `${(t / max) * 100}%` }}
              >
                {compact(t)}
              </span>
            ))}
          </div>
          <div
            ref={plot}
            tabIndex={0}
            role="group"
            aria-roledescription="chart"
            aria-label={`${title}. ${formatINR(total)} in total; best day ${day(data[best]!.date)} with ${formatINR(data[best]!.revenue)}. Use left and right arrow keys to read each day.`}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative h-56 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {ticks.map((t) => (
              <span
                key={t}
                aria-hidden="true"
                className="absolute inset-x-0 h-px bg-border"
                style={{ bottom: `${(t / max) * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {data.map((d, i) => (
                <div
                  key={d.date}
                  className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center"
                  onPointerEnter={() => setActive(i)}
                  onPointerMove={() => active !== i && setActive(i)}
                >
                  <span
                    className={cn(
                      'block w-full max-w-6 rounded-t-[4px] bg-primary transition-opacity',
                      active !== null && active !== i && 'opacity-50',
                    )}
                    style={{ height: d.revenue ? `max(${(d.revenue / max) * 100}%, 2px)` : '0' }}
                  />
                </div>
              ))}
            </div>
            {a && active !== null && (
              <div
                role="status"
                className="pointer-events-none absolute top-0 z-raised -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-3 py-2 text-small shadow-md"
                style={{
                  left: `clamp(5.75rem, ${((active + 0.5) / data.length) * 100}%, calc(100% - 5.75rem))`,
                }}
              >
                <p className="font-semibold tabular-nums">{formatINR(a.revenue)}</p>
                <p className="text-text-muted">
                  {day(a.date, true)} · {a.orders} {a.orders === 1 ? 'order' : 'orders'}
                </p>
              </div>
            )}
          </div>
          <span aria-hidden="true" />
          <div
            className="mt-1 flex justify-between text-caption text-text-muted"
            aria-hidden="true"
          >
            <span>{day(data[0]!.date)}</span>
            <span>{day(data[Math.floor(data.length / 2)]!.date)}</span>
            <span>{day(data[data.length - 1]!.date)}</span>
          </div>
        </div>
      )}
    </figure>
  );
}
