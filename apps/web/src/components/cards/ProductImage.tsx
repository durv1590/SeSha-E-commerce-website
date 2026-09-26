import Image from 'next/image';
import { cn } from '@seshakart/ui';

export interface ProductImageData {
  url: string;
  alt: string;
}

/** Responsive `sizes` for product grids: 2 cols mobile, 3–4 tablet, 4–5 desktop. */
export const PRODUCT_GRID_SIZES = '(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 300px';

export interface ProductImageProps {
  image: ProductImageData | null;
  sizes?: string;
  priority?: boolean;
  className?: string;
}

/**
 * Product photo in a fixed square frame (no layout shift). Served by the Next.js
 * optimiser as AVIF/WebP at the width the device needs; lazy-loaded unless `priority`.
 * Falls back to a branded placeholder when a product has no image yet.
 */
export function ProductImage({
  image,
  sizes = PRODUCT_GRID_SIZES,
  priority,
  className,
}: ProductImageProps) {
  return (
    <div className={cn('relative aspect-square overflow-hidden bg-surface', className)}>
      {image ? (
        <Image
          src={image.url}
          alt={image.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-contain p-3 transition-transform duration-slow ease-standard group-hover:scale-[1.03]"
        />
      ) : (
        <div
          className="grid size-full place-items-center bg-surface-muted"
          role="img"
          aria-label="Image coming soon"
        >
          <Image
            src="/brand/logo/seshakart-icon-provisional.png"
            alt=""
            width={56}
            height={63}
            loading="eager"
            className="opacity-30 grayscale"
          />
        </div>
      )}
    </div>
  );
}
