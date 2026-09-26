import type { ProductSummary } from '@seshakart/types';
import { ProductCard } from '../cards/ProductCard';
import { SectionHeading } from '../layout/SectionHeading';
import { cardSlots } from '../cart/card-slots';
import { toCard } from './toCard';

/**
 * Horizontal product rail: swipeable with scroll-snap on touch screens, a tidy
 * 4–6 column row on desktop. Pure CSS — no carousel JavaScript.
 */
export function ProductRail({
  title,
  subtitle,
  viewAllHref,
  products,
  id,
}: {
  title: string;
  subtitle?: string | null;
  viewAllHref?: string;
  products: ProductSummary[];
  id: string;
}) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id} className="container-page py-section-sm">
      <SectionHeading
        id={id}
        title={title}
        subtitle={subtitle ?? undefined}
        viewAllHref={viewAllHref}
      />
      <ul className="-mx-gutter flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-gutter px-gutter pb-2 md:gap-4 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0 2xl:grid-cols-6">
        {products.slice(0, 12).map((p) => (
          <li
            key={p.id}
            className="w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[23%] lg:w-auto lg:[&:nth-child(n+6)]:hidden 2xl:[&:nth-child(6)]:block"
          >
            <ProductCard product={toCard(p)} headingLevel="h3" {...cardSlots(p)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
