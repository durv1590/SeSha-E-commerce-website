'use client';

import { Button, Checkbox } from '@seshakart/ui';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { Consent } from '@/lib/analytics/consent';

interface Props {
  initial: Consent | null;
  /** Which optional purposes this store actually uses. */
  offers: { analytics: boolean; marketing: boolean };
  onChoose: (c: Consent) => void;
  /** Present when reopened from "Cookie settings": close without changing anything. */
  onClose?: () => void;
}

/**
 * Cookie choices. Not a modal (the store stays usable), and "Reject" is exactly as easy
 * as "Accept". While open, the page reserves scroll padding so a focused element is
 * never hidden behind it (WCAG 2.4.11).
 */
export function ConsentBanner({ initial, offers, onChoose, onClose }: Props) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const [custom, setCustom] = useState(Boolean(initial));
  const [analytics, setAnalytics] = useState(initial?.analytics ?? false);
  const [marketing, setMarketing] = useState(initial?.marketing ?? false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const sync = () => (root.style.scrollPaddingBottom = `${el.offsetHeight + 16}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.scrollPaddingBottom = '';
    };
  }, []);

  useEffect(() => {
    if (initial) ref.current?.querySelector<HTMLElement>('input:not(:disabled), button')?.focus();
  }, [initial]);

  const all = { analytics: offers.analytics, marketing: offers.marketing };
  const none = { analytics: false, marketing: false };
  const uses = [offers.analytics && 'analytics', offers.marketing && 'marketing'].filter(Boolean);

  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface shadow-lg"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) onClose();
      }}
    >
      <div className="container-page flex flex-col gap-3 py-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
        <div className="flex max-w-3xl flex-col gap-1">
          <h2 id={titleId} className="text-h5">
            Your cookie choices
          </h2>
          <p className="text-small text-text-secondary">
            We use essential cookies to run the store (your cart, sign-in and security). With your
            permission we’d also like to use {uses.join(' and ')} cookies
            {offers.analytics && ' to understand how the store is used'}
            {offers.analytics && offers.marketing && ' and'}
            {offers.marketing && ' to measure our ads'}. You can change this at any time from
            “Cookie settings” at the bottom of every page.{' '}
            <Link href="/pages/privacy-policy">Privacy policy</Link>
          </p>
          {custom && (
            <fieldset className="mt-1 flex flex-col">
              <legend className="sr-only">Optional cookies</legend>
              <Checkbox
                label="Essential"
                description="Always on: needed for the store to work."
                checked
                disabled
              />
              {offers.analytics && (
                <Checkbox
                  label="Analytics"
                  description="Google Analytics: pages visited and products viewed, without your name, email or phone number."
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                />
              )}
              {offers.marketing && (
                <Checkbox
                  label="Marketing"
                  description="Meta Pixel: tells us which Facebook and Instagram ads lead to purchases."
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                />
              )}
            </fieldset>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap lg:shrink-0 lg:flex-nowrap">
          {custom ? (
            <>
              <Button variant="primary" onClick={() => onChoose({ analytics, marketing })}>
                Save choices
              </Button>
              {onClose && (
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="primary" onClick={() => onChoose(all)}>
                Accept all
              </Button>
              <Button variant="primary" onClick={() => onChoose(none)}>
                Reject all
              </Button>
              <Button variant="outline" onClick={() => setCustom(true)}>
                Choose
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
