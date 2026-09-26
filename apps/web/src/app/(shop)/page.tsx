import Link from 'next/link';
import { buttonVariants } from '@seshakart/ui';
import { BrandIcon, type BrandIconName } from '@/components/brand/BrandIcon';

const PILLARS: { icon: BrandIconName; title: string; text: string }[] = [
  { icon: 'trust', title: 'Trusted', text: 'Genuine products and secure payments' },
  { icon: 'choice', title: 'More choices', text: 'A growing catalogue across categories' },
  { icon: 'speed', title: 'Fast delivery', text: 'Quick, trackable shipping across India' },
];

// Temporary landing while the storefront is built (Phases 3–11). Uses the Phase 2
// design system end to end.
export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-navy">
        <span
          aria-hidden="true"
          className="absolute -right-24 top-0 hidden h-full w-40 skew-x-[-25deg] bg-primary/40 md:block"
        />
        <span
          aria-hidden="true"
          className="absolute -right-4 top-0 hidden h-full w-10 skew-x-[-25deg] bg-accent/70 md:block"
        />
        <div className="container-page relative flex flex-col items-start gap-6 py-section">
          <h1 className="max-w-2xl text-display text-text-inverse">
            Smart Shopping, <span className="text-accent">Better Living</span>
          </h1>
          <p className="max-w-xl text-body-lg text-text-inverse/85">
            SeShaKart is getting ready. More choices, more value and fast delivery — launching soon
            at www.seshakart.com.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/register" className={buttonVariants({ variant: 'accent', size: 'lg' })}>
              Create your account
            </Link>
            <Link
              href="/login"
              className={buttonVariants({
                variant: 'outline',
                size: 'lg',
                className:
                  'border-text-inverse/40 bg-transparent text-text-inverse hover:border-accent hover:text-accent',
              })}
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section
        aria-label="Why SeShaKart"
        className="container-page grid gap-4 py-section-sm sm:grid-cols-3"
      >
        {PILLARS.map((p) => (
          <div
            key={p.title}
            className="flex items-start gap-4 rounded-card border border-border bg-surface p-5"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-primary-light text-primary">
              <BrandIcon name={p.icon} />
            </span>
            <div>
              <h2 className="text-h5">{p.title}</h2>
              <p className="mt-1 text-small text-text-muted">{p.text}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
