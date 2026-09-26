import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Breadcrumbs } from '@/components/catalog/Breadcrumbs';
import { TrackOrder } from '@/components/orders/TrackOrder';

export const metadata: Metadata = {
  title: 'Track your order',
  description:
    'Check the status of your SeShaKart order with your order number and email or mobile number.',
  alternates: { canonical: '/track-order' },
};

export default function Page() {
  return (
    <div className="container-page pb-section pt-4">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Track order' }]} />
      <div className="mx-auto mt-6 max-w-2xl">
        <h1 className="text-h1">Track your order</h1>
        <p className="mt-1 text-text-secondary">
          Enter your order number (from your confirmation email) and the email or mobile number you
          used.
        </p>
        <Suspense>
          <TrackOrder />
        </Suspense>
      </div>
    </div>
  );
}
