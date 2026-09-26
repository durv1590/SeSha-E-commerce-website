import type { Metadata } from 'next';
import { MyReviews } from '@/components/account/MyReviews';

export const metadata: Metadata = { title: 'Reviews' };

export default function Page() {
  return (
    <>
      <h1 className="text-h2">Reviews</h1>
      <p className="mt-1 text-text-secondary">Share what you think of products you’ve received.</p>
      <div className="mt-6">
        <MyReviews />
      </div>
    </>
  );
}
