import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { CheckoutView } from '@/components/checkout/CheckoutView';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/** Rendered in the browser: it reads the guest cart, whose cookie is scoped to /api. */
export default function Page() {
  return (
    <div className="container-page pb-section pt-4">
      <Breadcrumbs items={[{ name: 'Cart', href: '/cart' }, { name: 'Checkout' }]} />
      <h1 className="mt-4 text-h1">Checkout</h1>
      <div className="mt-6">
        <CheckoutView />
      </div>
    </div>
  );
}
