import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@seshakart/ui';

export interface BrandCardProps {
  name: string;
  href: string;
  logo?: { url: string } | null;
  className?: string;
}

/** Partner-brand tile: logo on a clean white surface, name as the accessible label. */
export function BrandCard({ name, href, logo, className }: BrandCardProps) {
  return (
    <Link
      href={href}
      aria-label={name}
      className={cn(
        'grid h-20 place-items-center rounded-card border border-border bg-surface px-4 no-underline',
        'transition-[border-color,box-shadow] duration-base hover:border-primary hover:shadow-sm md:h-24',
        className,
      )}
    >
      {logo ? (
        <Image
          src={logo.url}
          alt=""
          width={120}
          height={48}
          className="max-h-12 w-auto object-contain"
        />
      ) : (
        <span className="font-heading text-h5 text-navy">{name}</span>
      )}
    </Link>
  );
}
