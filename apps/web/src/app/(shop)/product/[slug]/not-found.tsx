import { EmptyState, buttonVariants } from '@seshakart/ui';
import { PackageX } from 'lucide-react';
import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="container-page py-section">
      <EmptyState
        icon={<PackageX size={28} aria-hidden="true" />}
        title="This product isn’t available"
        description="It may have been removed or is no longer sold. Explore similar products instead."
        action={
          <Link href="/products" className={buttonVariants({ variant: 'accent' })}>
            Browse all products
          </Link>
        }
      />
    </div>
  );
}
