import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderResult } from '@/components/checkout/OrderResult';

export const metadata: Metadata = {
  title: 'Order confirmation',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="container-page py-section-sm">
      <Suspense>
        <OrderResult mode="success" />
      </Suspense>
    </div>
  );
}
