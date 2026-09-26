'use client';

import type { CartDto, WishlistItemDto } from '@seshakart/types';
import {
  Alert,
  Button,
  EmptyState,
  Price,
  Skeleton,
  StockBadge,
  buttonVariants,
  cn,
  useToast,
} from '@seshakart/ui';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api/browser';
import { ApiError } from '@/lib/api/errors';
import { cartChanged, setWishlist } from '@/lib/cart/store';
import { ProductImage } from '../cards/ProductImage';

/** The signed-in customer's wishlist with live prices, stock and move-to-cart. */
export function WishlistView() {
  const { toast } = useToast();
  const router = useRouter();
  const [items, setItems] = useState<WishlistItemDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    api
      .get<WishlistItemDto[]>('/wishlist')
      .then(setItems, (err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'We couldn’t load your wishlist.'),
      );
  }, []);

  const drop = (productId: string) => {
    const next = (items ?? []).filter((i) => i.productId !== productId);
    setItems(next);
    setWishlist(next.map((i) => i.productId));
  };

  const remove = async (item: WishlistItemDto) => {
    setPending(item.productId);
    try {
      setWishlist(await api.delete<string[]>(`/wishlist/${item.productId}`));
      setItems((all) => (all ?? []).filter((i) => i.productId !== item.productId));
      setAnnouncement(`${item.name} removed from your wishlist.`);
    } catch (err) {
      toast({
        variant: 'error',
        title: err instanceof ApiError ? err.message : 'Couldn’t remove it.',
      });
    } finally {
      setPending(null);
    }
  };

  const move = async (item: WishlistItemDto) => {
    setPending(item.productId);
    try {
      const cart = await api.post<CartDto>(`/wishlist/${item.productId}/move-to-cart`);
      cartChanged(cart);
      drop(item.productId);
      setAnnouncement(`${item.name} moved to your cart.`);
      toast({
        variant: 'success',
        title: 'Moved to cart',
        description: item.name,
        action: { label: 'View cart', onClick: () => router.push('/cart') },
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'VARIANT_REQUIRED') {
        router.push(`/product/${item.slug}`);
        return;
      }
      toast({
        variant: 'error',
        title: err instanceof ApiError ? err.message : 'Couldn’t move it.',
      });
    } finally {
      setPending(null);
    }
  };

  if (error) return <Alert variant="error">{error}</Alert>;
  if (!items) {
    return (
      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4"
        aria-busy="true"
        aria-label="Loading your wishlist"
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[3/5] rounded-card" />
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon={<Heart size={28} aria-hidden="true" />}
        title="Your wishlist is empty"
        description="Tap the heart on any product to save it here for later."
        action={
          <Link href="/deals" className={buttonVariants({ variant: 'primary' })}>
            Explore deals
          </Link>
        }
      />
    );
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <p className="mb-4 text-small text-text-muted">
        {items.length} {items.length === 1 ? 'product' : 'products'}
      </p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
        {items.map((item) => {
          const busy = pending === item.productId;
          const unavailable = !item.available;
          const outOfStock = item.stock === 'out_of_stock';
          return (
            <li
              key={item.productId}
              aria-busy={busy || undefined}
              className={cn(
                'flex flex-col overflow-hidden rounded-card border border-border bg-surface',
                busy && 'opacity-70',
              )}
            >
              <Link href={`/product/${item.slug}`} tabIndex={-1} aria-hidden="true">
                <ProductImage image={item.image} className={cn(outOfStock && 'opacity-60')} />
              </Link>
              <div className="flex flex-1 flex-col gap-1.5 p-3 md:p-4">
                {item.brand && (
                  <p className="truncate text-caption font-semibold uppercase tracking-wide text-text-muted">
                    {item.brand}
                  </p>
                )}
                <h2 className="font-body text-product-title">
                  <Link
                    href={`/product/${item.slug}`}
                    className="line-clamp-2 text-text-primary no-underline hover:text-primary"
                  >
                    {item.name}
                  </Link>
                </h2>
                {unavailable ? (
                  <p className="mt-auto text-small font-medium text-text-muted">
                    No longer available
                  </p>
                ) : (
                  <>
                    <Price price={item.price} mrp={item.mrp} size="sm" className="mt-auto pt-1" />
                    {item.stock !== 'in_stock' && (
                      <StockBadge state={item.stock} className="self-start" />
                    )}
                  </>
                )}
                <div className="mt-2 flex flex-col gap-2">
                  {!unavailable && !outOfStock && (
                    <Button
                      size="sm"
                      fullWidth
                      loading={busy}
                      onClick={() => move(item)}
                      aria-label={
                        item.hasMultipleVariants
                          ? `Choose options for ${item.name}`
                          : `Move ${item.name} to cart`
                      }
                    >
                      <ShoppingCart size={16} aria-hidden="true" />
                      {item.hasMultipleVariants ? 'Choose options' : 'Move to cart'}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    fullWidth
                    disabled={busy}
                    onClick={() => remove(item)}
                    aria-label={`Remove ${item.name} from wishlist`}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
