import type { BannerDto } from '@seshakart/types';
import { buttonVariants, cn } from '@seshakart/ui';
import Link from 'next/link';

const THEMES = {
  PRIMARY: {
    box: 'bg-primary',
    title: 'text-text-inverse',
    // White on primary blue is 4.6:1; any transparency drops it below AA.
    text: 'text-text-inverse',
    cta: 'accent' as const,
  },
  NAVY: {
    box: 'bg-navy',
    title: 'text-text-inverse',
    text: 'text-text-inverse/85',
    cta: 'accent' as const,
  },
  ACCENT: { box: 'bg-accent', title: 'text-navy', text: 'text-navy/85', cta: 'secondary' as const },
  LIGHT: {
    box: 'bg-primary-light',
    title: 'text-navy',
    text: 'text-text-secondary',
    cta: 'primary' as const,
  },
};

/**
 * Admin-managed hero banner. Uses responsive artwork (desktop / tablet / mobile)
 * when uploaded; otherwise a token-themed text banner with the brand's diagonal motif.
 */
export function HeroBanner({ banner, priority }: { banner: BannerDto; priority?: boolean }) {
  const t = THEMES[banner.theme];
  const hasArt = Boolean(banner.imageDesktop || banner.imageMobile);
  return (
    <div
      className={cn(
        'relative isolate flex min-h-64 w-full overflow-hidden rounded-xl md:min-h-80 lg:min-h-96',
        t.box,
      )}
    >
      {hasArt && (
        <picture className="absolute inset-0 -z-10">
          {banner.imageMobile && <source media="(max-width: 767px)" srcSet={banner.imageMobile} />}
          {banner.imageTablet && <source media="(max-width: 1279px)" srcSet={banner.imageTablet} />}
          {/* Art-directed <picture> needs a native <img> (next/image cannot switch sources). */}
          <img
            src={banner.imageDesktop ?? banner.imageMobile ?? ''}
            alt={banner.imageAlt ?? ''}
            className="size-full object-cover"
            fetchPriority={priority ? 'high' : 'auto'}
            loading={priority ? 'eager' : 'lazy'}
          />
        </picture>
      )}
      {!hasArt && (
        <>
          <span
            aria-hidden="true"
            className="absolute -right-20 top-0 -z-10 h-full w-48 skew-x-[-25deg] bg-surface/10 md:w-72"
          />
          <span
            aria-hidden="true"
            className="absolute right-10 top-0 -z-10 hidden h-full w-16 skew-x-[-25deg] bg-accent/60 md:block"
          />
          <span
            aria-hidden="true"
            className="absolute right-36 top-0 -z-10 hidden h-full w-6 skew-x-[-25deg] bg-primary/50 md:block"
          />
        </>
      )}
      <div className="flex max-w-xl flex-col items-start justify-center gap-3 p-6 pb-16 md:p-10 md:pb-16 lg:p-14">
        <h2 className={cn('text-display', t.title)}>{banner.title}</h2>
        {banner.subtitle && (
          <p className={cn('text-body md:text-body-lg', t.text)}>{banner.subtitle}</p>
        )}
        {banner.link && banner.ctaLabel && (
          <Link
            href={banner.link}
            className={cn(buttonVariants({ variant: t.cta, size: 'lg' }), 'mt-2')}
          >
            {banner.ctaLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
