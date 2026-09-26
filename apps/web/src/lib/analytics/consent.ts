/**
 * Cookie consent (Digital Personal Data Protection Act 2023 / ePrivacy practice):
 * analytics and marketing tags load only after the visitor opts in to that purpose.
 * Essential cookies (session, cart, CSRF) need no consent and are not covered here.
 *
 * Stored in a first-party cookie, `sk_consent=v1.a1.m0`, readable by the browser so the
 * choice applies before any tag loads. Bump the version to ask everyone again (for
 * example after adding a new tracker).
 */

export const CONSENT_COOKIE = 'sk_consent';
/** Window event that reopens the cookie banner ("Cookie settings" in the footer). */
export const OPEN_CONSENT_EVENT = 'sk:open-consent';
export const CONSENT_VERSION = 'v1';
/** Ask again after about six months. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;

export interface Consent {
  analytics: boolean;
  marketing: boolean;
}

export function serializeConsent(c: Consent): string {
  return `${CONSENT_VERSION}.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}`;
}

/** The stored choice, or null when the visitor hasn't chosen (or chose under an old version). */
export function parseConsent(value: string | undefined | null): Consent | null {
  const m = /^v(\d+)\.a([01])\.m([01])$/.exec(value ?? '');
  if (!m || `v${m[1]}` !== CONSENT_VERSION) return null;
  return { analytics: m[2] === '1', marketing: m[3] === '1' };
}

export function readConsentCookie(cookie: string): Consent | null {
  const raw = cookie
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(raw ? decodeURIComponent(raw.slice(CONSENT_COOKIE.length + 1)) : null);
}

/** Cookies set by the tags themselves, removed when consent is withdrawn. */
export function trackerCookieNames(all: string[]): string[] {
  return all.filter((n) => /^(_ga($|_)|_gid$|_gat|_gcl_|_fbp$|_fbc$)/.test(n));
}
