'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactNode } from 'react';

/**
 * Filter form. Works without JavaScript (plain GET submit); with JavaScript it
 * navigates client-side, merges repeated brand checkboxes into one CSV param and,
 * on desktop, applies filters as soon as a control changes.
 */
export function FilterForm({
  id,
  action,
  fixed,
  autoSubmit,
  children,
  onApplied,
  className,
}: {
  id: string;
  action: string;
  /** Params carried through unchanged (e.g. sort on a category page). */
  fixed?: Record<string, string>;
  autoSubmit?: boolean;
  children: ReactNode;
  onApplied?: () => void;
  className?: string;
}) {
  const router = useRouter();

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(fixed ?? {})) params.set(k, v);
    const brands = data.getAll('brand').map(String).filter(Boolean);
    if (brands.length) params.set('brand', brands.join(','));
    for (const key of ['min', 'max', 'discount', 'inStock', 'sort']) {
      const value = String(data.get(key) ?? '').trim();
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    router.push(qs ? `${action}?${qs}` : action, { scroll: false });
    onApplied?.();
  };

  return (
    <form
      id={id}
      method="get"
      action={action}
      className={className}
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement;
        // Typed price fields apply on submit/blur, not on every keystroke.
        if (autoSubmit && target.type !== 'number') submit(e.currentTarget);
      }}
    >
      {children}
    </form>
  );
}
