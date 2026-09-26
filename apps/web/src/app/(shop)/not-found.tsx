import { EmptyState, buttonVariants } from '@seshakart/ui';
import { Compass } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="container-page py-section">
      <EmptyState
        icon={<Compass size={28} aria-hidden="true" />}
        headingLevel="h1"
        title="We couldn’t find that page"
        description="The link may be broken or the page may have moved."
        action={
          <Link href="/" className={buttonVariants({ variant: 'accent' })}>
            Go to the homepage
          </Link>
        }
      />
    </div>
  );
}
