import Link from 'next/link';
import { buttonVariants } from '@seshakart/ui';
import { BrandIcon, type BrandIconName } from '@/components/brand/BrandIcon';
import { Logo } from '@/components/brand/Logo';

const PILLARS: { icon: BrandIconName; title: string; text: string }[] = [
  { icon: 'trust', title: 'Trusted', text: 'Genuine products and secure payments' },
  { icon: 'choice', title: 'More choices', text: 'A growing catalogue across categories' },
  { icon: 'speed', title: 'Fast delivery', text: 'Quick, trackable shipping across India' },
];

// Temporary landing while the storefront is built (Phases 3–11). Uses the Phase 2
// design system end to end.
export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col">
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
          <Logo tone="reversed" height={44} priority />
          <h1 className="max-w-2xl text-display text-text-inverse">
            Smart Shopping, <span className="text-accent">Better Living</span>
          </h1>
          <p className="max-w-xl text-body-lg text-text-inverse/85">
            SeShaKart is getting ready. More choices, more value and fast delivery — launching soon
            at www.seshakart.com.
          </p>
          <a
            href="mailto:durvesh15aug@gmail.com"
            className={buttonVariants({ variant: 'accent', size: 'lg' })}
          >
            Contact us
          </a>
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

      <footer className="mt-auto border-t border-border bg-surface">
        <div className="container-page flex flex-col gap-2 py-6 text-small text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SeShaKart Pvt. Ltd.</p>
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <a href="mailto:durvesh15aug@gmail.com">durvesh15aug@gmail.com</a>
            <a href="tel:+918218397819" className="whitespace-nowrap">
              +91 82183 97819
            </a>
          </p>
          {process.env.NODE_ENV !== 'production' && (
            <Link href="/design-system">Design system</Link>
          )}
        </div>
      </footer>
    </main>
  );
}
