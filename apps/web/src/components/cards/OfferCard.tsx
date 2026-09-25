import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@seshakart/ui';

export type OfferTheme = 'primary' | 'navy' | 'accent' | 'light';

const themes: Record<OfferTheme, { box: string; title: string; text: string; cta: string }> = {
  primary: {
    box: 'bg-primary',
    title: 'text-text-inverse',
    text: 'text-text-inverse/90',
    cta: 'bg-accent text-navy',
  },
  navy: {
    box: 'bg-navy',
    title: 'text-text-inverse',
    text: 'text-text-inverse/85',
    cta: 'bg-accent text-navy',
  },
  accent: {
    box: 'bg-accent',
    title: 'text-navy',
    text: 'text-navy/85',
    cta: 'bg-navy text-text-inverse',
  },
  light: {
    box: 'bg-primary-light',
    title: 'text-navy',
    text: 'text-text-secondary',
    cta: 'bg-primary text-text-inverse',
  },
};

export interface OfferCardProps {
  title: string;
  subtitle?: string;
  href: string;
  ctaLabel?: string;
  theme?: OfferTheme;
  image?: { url: string; alt: string } | null;
  className?: string;
}

/**
 * Promotional tile (admin-managed content). Theme names map to design tokens so
 * admins pick a brand theme rather than entering raw colours. Decorative diagonal
 * stripe echoes the brand pattern from the board.
 */
export function OfferCard({
  title,
  subtitle,
  href,
  ctaLabel = 'Shop now',
  theme = 'primary',
  image,
  className,
}: OfferCardProps) {
  const t = themes[theme];
  return (
    <Link
      href={href}
      className={cn(
        'group relative flex min-h-40 overflow-hidden rounded-card p-5 no-underline md:min-h-48 md:p-6',
        t.box,
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-[140%] w-24 rotate-[25deg] bg-surface/10"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -top-10 h-[140%] w-6 rotate-[25deg] bg-accent/40"
      />
      <div className="relative z-raised flex max-w-[60%] flex-col items-start gap-2">
        <h3 className={cn('font-heading text-h3', t.title)}>{title}</h3>
        {subtitle && <p className={cn('text-small', t.text)}>{subtitle}</p>}
        <span
          className={cn(
            'mt-auto inline-flex h-control-sm items-center gap-1.5 rounded-pill px-4 text-small font-semibold transition-transform duration-base group-hover:translate-x-0.5',
            t.cta,
          )}
        >
          {ctaLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </span>
      </div>
      {image && (
        <Image
          src={image.url}
          alt={image.alt}
          width={220}
          height={220}
          sizes="(max-width: 767px) 40vw, 220px"
          className="absolute bottom-0 right-0 h-full w-[40%] object-contain object-bottom"
        />
      )}
    </Link>
  );
}
