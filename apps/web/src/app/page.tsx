import Image from 'next/image';

// Phase 1 placeholder. The real storefront homepage is built in later phases on top
// of the Phase 2 design system.
export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-50 px-4 text-center">
      <Image
        src="/brand/logo/seshakart-logo-stacked-provisional.png"
        alt="SeShaKart — Smart Shopping, Better Living"
        width={240}
        height={222}
        priority
      />
      <h1 className="text-2xl font-semibold text-slate-900">SeShaKart is being built</h1>
      <p className="max-w-md text-slate-600">
        Foundation in place: web app, API and shared packages. The storefront arrives in the next
        phases.
      </p>
    </main>
  );
}
