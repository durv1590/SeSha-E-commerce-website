'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { GA_ID, META_PIXEL_ID, TRACKING_CONFIGURED } from '@/lib/analytics/config';
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  OPEN_CONSENT_EVENT,
  readConsentCookie,
  serializeConsent,
  trackerCookieNames,
  type Consent,
} from '@/lib/analytics/consent';
import { setTrackingConsent } from '@/lib/analytics/track';
import { analyticsUrl, hasSensitiveParams } from '@/lib/analytics/url';
import { ConsentBanner } from './ConsentBanner';

function loadScript(src: string) {
  if (document.querySelector(`script[src="${src}"]`)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function sanitizedReferrer(): string | undefined {
  if (!document.referrer) return undefined;
  try {
    const r = new URL(document.referrer);
    return r.origin === location.origin ? analyticsUrl(r.origin, r.pathname, r.search) : r.origin;
  } catch {
    return undefined;
  }
}

function startGa() {
  if (!GA_ID || window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js requires the arguments object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  // Consent Mode: measurement only; nothing for advertising.
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, {
    send_page_view: false, // sent by <PageViews> with a cleaned address
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    page_location: analyticsUrl(location.origin, location.pathname, location.search),
    page_referrer: sanitizedReferrer(),
  });
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`);
}

function startPixel() {
  if (!META_PIXEL_ID || window.fbq) return;
  const fbq = function fbq(...args: unknown[]) {
    const self = fbq as unknown as { callMethod?: (...a: unknown[]) => void; queue: unknown[] };
    if (self.callMethod) self.callMethod(...args);
    else self.queue.push(args);
  } as NonNullable<Window['fbq']> & Record<string, unknown>;
  Object.assign(fbq, { push: fbq, loaded: true, version: '2.0', queue: [] });
  window.fbq = fbq;
  window._fbq = fbq;
  // No automatic button-click or page-metadata collection: only the events we send.
  fbq('set', 'autoConfig', false, META_PIXEL_ID);
  fbq('init', META_PIXEL_ID);
  loadScript('https://connect.facebook.net/en_US/fbevents.js');
}

function saveConsent(c: Consent) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(c)}; Path=/; Max-Age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
}

/** Removes the tags' own cookies on this host and its parent domain. */
function clearTrackerCookies() {
  const names = trackerCookieNames(document.cookie.split(';').map((c) => c.split('=')[0]!.trim()));
  const host = location.hostname;
  const parent = host.split('.').slice(-2).join('.');
  for (const n of names)
    for (const domain of ['', `; Domain=${host}`, `; Domain=.${parent}`])
      document.cookie = `${n}=; Path=/; Max-Age=0${domain}`;
}

/** Sends a page view on every client-side navigation (after consent). */
function PageViews({ consent }: { consent: Consent }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    // Let the new page's <title> land first.
    const t = setTimeout(() => {
      const url = analyticsUrl(location.origin, pathname, search);
      if (consent.analytics && window.gtag) {
        window.gtag('set', { page_location: url });
        window.gtag('event', 'page_view', { page_location: url, page_title: document.title });
      }
      if (consent.marketing && window.fbq && !hasSensitiveParams(search))
        window.fbq('track', 'PageView');
    }, 0);
    return () => clearTimeout(t);
  }, [pathname, search, consent]);
  return null;
}

/**
 * Consent-aware analytics for the storefront (never the admin): shows the cookie banner
 * until the visitor chooses, then loads Google Analytics 4 and/or the Meta Pixel for the
 * purposes they agreed to. Renders nothing when no tracker is configured.
 */
export function Analytics() {
  // undefined = cookie not read yet (server render / first paint): show nothing.
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined);
  const [bannerOpen, setBannerOpen] = useState(false);

  useEffect(() => {
    if (!TRACKING_CONFIGURED) return;
    const stored = readConsentCookie(document.cookie);
    setConsent(stored);
    setBannerOpen(stored === null);
    const open = () => setBannerOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, []);

  useEffect(() => {
    if (!consent) return;
    if (consent.analytics) startGa();
    if (consent.marketing) startPixel();
    setTrackingConsent(consent); // flushes events queued while the page loaded
  }, [consent]);

  const choose = useCallback(
    (next: Consent) => {
      const withdrawn =
        (consent?.analytics && !next.analytics) || (consent?.marketing && !next.marketing);
      saveConsent(next);
      setBannerOpen(false);
      if (withdrawn) {
        // Loaded tags can't be unloaded: clear their cookies and start a clean page.
        setTrackingConsent(next);
        clearTrackerCookies();
        location.reload();
        return;
      }
      setConsent(next);
    },
    [consent],
  );

  if (!TRACKING_CONFIGURED) return null;
  return (
    <>
      {consent && (
        <Suspense>
          <PageViews consent={consent} />
        </Suspense>
      )}
      {bannerOpen && (
        <ConsentBanner
          initial={consent ?? null}
          offers={{ analytics: Boolean(GA_ID), marketing: Boolean(META_PIXEL_ID) }}
          onChoose={choose}
          onClose={consent ? () => setBannerOpen(false) : undefined}
        />
      )}
    </>
  );
}
