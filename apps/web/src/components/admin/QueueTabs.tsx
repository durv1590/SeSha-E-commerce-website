import { cn } from '@seshakart/ui';
import Link from 'next/link';

/** Segmented links for work queues / views; the current one has aria-current. */
export function QueueTabs({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string; current: boolean }[];
}) {
  return (
    <nav aria-label={label} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-1 rounded-button border border-border bg-surface p-1">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.current ? 'page' : undefined}
              className={cn(
                'block whitespace-nowrap rounded-sm px-3 py-1.5 text-small font-medium no-underline',
                i.current
                  ? 'bg-navy text-text-inverse'
                  : 'text-text-primary hover:bg-surface-muted',
              )}
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
