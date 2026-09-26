import type { Metadata } from 'next';
import { Suspense } from 'react';
import { OrderResult } from '@/components/checkout/OrderResult';

export const metadata: Metadata = {
  title: 'Payment not completed',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <div className="container-page py-section-sm">
      <Suspense>
        <OrderResult mode="failed" />
      </Suspense>
    </div>
  );
}
