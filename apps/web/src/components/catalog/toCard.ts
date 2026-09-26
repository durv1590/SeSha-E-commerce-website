import type { ProductSummary } from '@seshakart/types';
import type { ProductCardData } from '../cards/ProductCard';

/** Maps the API's product summary onto the design-system product card. */
export function toCard(p: ProductSummary): ProductCardData {
  return {
    slug: p.slug,
    name: p.name,
    brandName: p.brand?.name ?? null,
    image: p.image ? { url: p.image.url, alt: p.image.alt } : null,
    mrp: p.mrp,
    price: p.price,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    stock: p.stock,
    available: p.available,
    badges: p.badges,
  };
}
