'use client';

import { buttonVariants, cn } from '@seshakart/ui';
import { Heart, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { useCartState } from '@/lib/cart/store';

function CountBadge({ count }: { count: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-pill bg-accent px-1 text-caption font-bold leading-none text-navy"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Header cart link with a live item count (the count is part of its accessible name). */
export function CartLink() {
  const { cartCount } = useCartState();
  const count = cartCount ?? 0;
  const label = count ? `Cart, ${count} ${count === 1 ? 'item' : 'items'}` : 'Cart';
  return (
    <Link
      href="/cart"
      aria-label={label}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative text-nav')}
    >
      <ShoppingCart size={22} aria-hidden="true" />
      {count > 0 && <CountBadge count={count} />}
    </Link>
  );
}

/** Header wishlist link (desktop and tablet); guests are sent to sign in first. */
export function WishlistLink() {
  const { wishlist } = useCartState();
  const count = wishlist?.size ?? 0;
  const label = count ? `Wishlist, ${count} ${count === 1 ? 'item' : 'items'}` : 'Wishlist';
  return (
    <Link
      href="/account/wishlist"
      aria-label={label}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative text-nav')}
    >
      <Heart size={22} aria-hidden="true" />
      {count > 0 && <CountBadge count={count} />}
    </Link>
  );
}
