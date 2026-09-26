import type { Consent } from './consent';
import { toGa4, toMeta, type AnalyticsEvent } from './events';
import { hasSensitiveParams } from './url';

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[] };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/**
 * Current consent, set by <Analytics> once the cookie is read or the visitor chooses.
 * Until then (the first moments of a page load) events wait in a short queue, so a
 * product view fired while the page hydrates isn't lost, and is dropped without consent.
 */
let consent: Consent | null = null;
let pending: AnalyticsEvent[] = [];
const MAX_PENDING = 20;

export function setTrackingConsent(c: Consent) {
  consent = c;
  const queued = pending;
  pending = [];
  // After the page view that <Analytics> sends for the current page.
  if (queued.length) setTimeout(() => queued.forEach(send), 0);
}

/**
 * Sends a store event to every tool the visitor has agreed to. A no-op on the server,
 * without consent, or when no tool is configured, so callers never need to check.
 */
export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return;
  if (!consent) {
    if (pending.length < MAX_PENDING) pending.push(event);
    return;
  }
  send(event);
}

function send(event: AnalyticsEvent): void {
  if (!consent) return;
  try {
    if (consent.analytics && window.gtag) {
      const [name, params] = toGa4(event);
      window.gtag('event', name, params);
    }
    if (consent.marketing && window.fbq && !hasSensitiveParams(window.location.search)) {
      const meta = toMeta(event);
      if (meta) window.fbq('track', ...meta);
    }
  } catch {
    // Analytics must never break the store.
  }
}
