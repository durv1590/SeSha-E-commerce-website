import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { CartView } from '@/components/cart/CartView';

export const metadata: Metadata = {
  title: 'Shopping cart',
  robots: { index: false, follow: false },
};

/**
 * The cart renders in the browser: guest carts are identified by an HttpOnly cookie
 * scoped to /api, which page requests never carry.
 */
export default function Page() {
  return (
    <div className="container-page pb-32 pt-4 lg:pb-section">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Cart' }]} />
      <div className="mt-4">
        <CartView />
      </div>
    </div>
  );
}
