'use client';

import { Button, buttonVariants, cn, useToast } from '@seshakart/ui';
import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '@/lib/api/errors';
import { addToCart } from '@/lib/cart/store';

/**
 * One-tap "Add to cart" for product cards. Products with options link to the
 * product page instead, so the shopper always chooses the variant knowingly.
 */
export function AddToCartButton({
  slug,
  productName,
  variantId,
  hasOptions,
  outOfStock,
}: {
  slug: string;
  productName: string;
  variantId: string | null;
  hasOptions: boolean;
  outOfStock: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const base = 'w-full';

  if (outOfStock || !variantId) {
    return (
      <Button variant="outline" size="sm" className={base} disabled>
        Out of stock
      </Button>
    );
  }
  if (hasOptions) {
    return (
      <Link
        href={`/product/${slug}`}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), base)}
        aria-label={`Choose options for ${productName}`}
      >
        Choose options
      </Link>
    );
  }
  return (
    <Button
      variant="primary"
      size="sm"
      className={base}
      loading={busy}
      aria-label={`Add ${productName} to cart`}
      onClick={async () => {
        setBusy(true);
        try {
          await addToCart(variantId);
          toast({
            variant: 'success',
            title: 'Added to cart',
            description: productName,
            action: { label: 'View cart', onClick: () => router.push('/cart') },
          });
        } catch (err) {
          toast({
            variant: 'error',
            title: err instanceof ApiError ? err.message : 'Couldn’t add this item.',
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <ShoppingCart size={16} aria-hidden="true" />
      Add to cart
    </Button>
  );
}
