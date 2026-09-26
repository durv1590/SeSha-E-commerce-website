import type { Metadata } from 'next';
import { WishlistView } from '@/components/cart/WishlistView';

export const metadata: Metadata = { title: 'Wishlist' };

export default function Page() {
  return (
    <>
      <h1 className="text-h2">Wishlist</h1>
      <p className="mt-1 text-text-secondary">
        Products you’ve saved, with today’s price and availability.
      </p>
      <div className="mt-6">
        <WishlistView />
      </div>
    </>
  );
}
