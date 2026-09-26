import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

export interface Crumb {
  name: string;
  href?: string;
}

/** Accessible breadcrumb trail; the current page is the last item (not a link). */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="overflow-x-auto">
      <ol className="flex items-center gap-1 whitespace-nowrap text-small text-text-muted">
        {items.map((c, i) => (
          <li key={`${c.name}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} aria-hidden="true" className="shrink-0" />}
            {c.href && i < items.length - 1 ? (
              <Link
                href={c.href}
                className="inline-flex min-h-6 items-center text-text-secondary no-underline hover:text-primary hover:underline"
              >
                {c.name}
              </Link>
            ) : (
              <span
                aria-current={i === items.length - 1 ? 'page' : undefined}
                className="font-medium text-text-primary"
              >
                {c.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
