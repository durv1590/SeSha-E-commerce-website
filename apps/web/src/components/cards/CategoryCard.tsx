import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@seshakart/ui';

export interface CategoryCardProps {
  name: string;
  href: string;
  image?: { url: string; alt?: string } | null;
  /** Optional line such as "1,240 products" — only real counts. */
  meta?: string;
  className?: string;
}

/** Round-image category tile used in featured-category rows and category grids. */
export function CategoryCard({ name, href, image, meta, className }: CategoryCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex flex-col items-center gap-2 rounded-card p-2 text-center no-underline',
        'transition-colors duration-base hover:bg-surface',
        className,
      )}
    >
      <span className="relative grid aspect-square w-full max-w-28 place-items-center overflow-hidden rounded-pill border border-border bg-primary-light transition-[border-color,box-shadow] duration-base group-hover:border-primary group-hover:shadow-sm">
        {image ? (
          <Image src={image.url} alt="" fill sizes="112px" className="object-cover" />
        ) : (
          <span aria-hidden="true" className="font-heading text-h3 text-primary">
            {name.charAt(0)}
          </span>
        )}
      </span>
      <span className="line-clamp-2 text-small font-semibold text-text-primary group-hover:text-primary">
        {name}
      </span>
      {meta && <span className="text-caption text-text-muted">{meta}</span>}
    </Link>
  );
}
