import type { TimelineStepDto } from '@seshakart/types';
import { cn } from '@seshakart/ui';
import { Check } from 'lucide-react';
import { dateTime } from '@/lib/orders/format';

/**
 * Order progress: an ordered list (read in order by screen readers), vertical on
 * phones and horizontal from 640px. The current step is marked with aria-current.
 */
export function OrderTimeline({ steps }: { steps: TimelineStepDto[] }) {
  const current = steps.map((s) => s.done).lastIndexOf(true);
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:gap-0" aria-label="Order progress">
      {steps.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === current ? 'step' : undefined}
          className="relative flex gap-3 pb-5 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-2 sm:pb-0 sm:text-center"
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-[0.8125rem] top-7 h-[calc(100%-1.75rem)] w-0.5 sm:left-[calc(50%+1rem)] sm:top-[0.8125rem] sm:h-0.5 sm:w-[calc(100%-2rem)]',
                steps[i + 1]!.done ? 'bg-primary' : 'bg-border',
              )}
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative z-raised grid size-7 shrink-0 place-items-center rounded-full border-2',
              s.done
                ? 'border-primary bg-primary text-text-inverse'
                : 'border-border-strong bg-surface text-text-muted',
            )}
          >
            {s.done ? (
              <Check size={14} strokeWidth={3} />
            ) : (
              <span className="size-1.5 rounded-full bg-border-strong" />
            )}
          </span>
          <span className="flex flex-col">
            <span className={cn('text-small font-semibold', !s.done && 'text-text-muted')}>
              {s.label}
              <span className="sr-only">{s.done ? ' (done)' : ' (pending)'}</span>
            </span>
            {s.at && <span className="text-caption text-text-muted">{dateTime(s.at)}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
