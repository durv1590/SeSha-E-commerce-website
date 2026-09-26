import type { ProductSummary } from '@seshakart/types';
import { AddToCartButton } from './AddToCartButton';
import { WishlistButton } from './WishlistButton';

/** Client islands for a product card: add-to-cart action and wishlist heart. */
export function cardSlots(p: ProductSummary) {
  return {
    action: (
      <AddToCartButton
        slug={p.slug}
        productName={p.name}
        variantId={p.defaultVariantId}
        hasOptions={p.hasMultipleVariants}
        outOfStock={p.stock === 'out_of_stock'}
      />
    ),
    wishlist: <WishlistButton productId={p.id} productName={p.name} />,
  };
}
