'use client';

import { cn, useToast } from '@seshakart/ui';
import { Heart } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { hasSession } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { toggleWishlist, useCartState } from '@/lib/cart/store';

/**
 * Heart toggle (aria-pressed). The wishlist lives on the server, so guests are
 * sent to sign in and brought back to the same page.
 */
export function WishlistButton({
  productId,
  productName,
  variant = 'overlay',
  className,
}: {
  productId: string;
  productName: string;
  /** "overlay": round icon over a card image; "inline": outlined button with a label. */
  variant?: 'overlay' | 'inline';
  className?: string;
}) {
  const { wishlist } = useCartState();
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const on = wishlist?.has(productId) ?? false;

  const click = async () => {
    if (!hasSession()) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    try {
      await toggleWishlist(productId, !on);
      toast({
        variant: 'success',
        title: on ? 'Removed from your wishlist' : 'Saved to your wishlist',
        action: on ? undefined : { label: 'View', onClick: () => router.push('/account/wishlist') },
      });
    } catch (err) {
      toast({
        variant: 'error',
        title: err instanceof ApiError ? err.message : 'Couldn’t update your wishlist.',
      });
    } finally {
      setBusy(false);
    }
  };

  const icon = (
    <Heart
      size={variant === 'overlay' ? 18 : 20}
      aria-hidden="true"
      className={cn(on ? 'fill-error text-error' : 'text-text-secondary')}
    />
  );
  if (variant === 'inline') {
    return (
      <button
        type="button"
        aria-pressed={on}
        disabled={busy}
        onClick={click}
        className={cn(
          'inline-flex min-h-touch items-center gap-2 rounded-button border border-border-strong bg-surface px-4 text-small font-semibold text-text-primary hover:border-primary disabled:opacity-60',
          className,
        )}
      >
        {icon}
        {on ? 'Wishlisted' : 'Wishlist'}
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`Save ${productName} to wishlist`}
      disabled={busy}
      onClick={click}
      className={cn(
        'grid size-11 place-items-center rounded-full bg-surface/90 shadow-sm backdrop-blur hover:bg-surface disabled:opacity-60',
        className,
      )}
    >
      {icon}
    </button>
  );
}
