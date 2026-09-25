import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@seshakart/ui';

export interface SectionHeadingProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  id?: string;
  className?: string;
}

/** Heading for homepage/listing sections, with an optional "View all" link. */
export function SectionHeading({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = 'View all',
  id,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('mb-4 flex items-end justify-between gap-4 md:mb-6', className)}>
      <div>
        <h2 id={id} className="text-h2">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-small text-text-muted md:text-body">{subtitle}</p>}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="inline-flex min-h-touch shrink-0 items-center gap-1 text-small font-semibold text-primary hover:underline"
        >
          {viewAllLabel}
          <span className="sr-only"> {title}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
