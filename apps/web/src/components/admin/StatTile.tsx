import { cn } from '@seshakart/ui';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

/**
 * Label · value · delta vs the previous period. The delta shows direction with an
 * icon and words, not colour alone.
 */
export function StatTile({
  label,
  value,
  current,
  previous,
  period,
}: {
  label: string;
  value: string;
  current: number;
  previous: number;
  period: string;
}) {
  const change = previous ? Math.round(((current - previous) / previous) * 100) : null;
  const dir = change === null || change === 0 ? 'flat' : change > 0 ? 'up' : 'down';
  const Icon = dir === 'up' ? ArrowUpRight : dir === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <p className="text-small text-text-secondary">{label}</p>
      <p className="font-heading text-h3 tabular-nums">{value}</p>
      <p
        className={cn(
          'flex items-center gap-1 text-caption',
          dir === 'up'
            ? 'text-success-text'
            : dir === 'down'
              ? 'text-error-text'
              : 'text-text-muted',
        )}
      >
        <Icon size={14} aria-hidden="true" />
        {change === null
          ? `No sales in the previous ${period}`
          : `${change > 0 ? 'Up' : change < 0 ? 'Down' : 'Same as'} ${change ? `${Math.abs(change)}% vs` : ''} previous ${period}`}
      </p>
    </div>
  );
}
