import type { Metadata } from 'next';
import type { RawSearchParams } from '../listing-params';

/** Site-wide SEO constants and helpers (pure: safe in server, client and tests). */

export const SITE_NAME = 'SeShaKart';
export const DEFAULT_OG_IMAGE = {
  url: '/brand/social/og-default.jpg',
  width: 1200,
  height: 630,
  alt: 'SeShaKart',
};

/**
 * The site URL this build was made for. Written as `process.env.NEXT_PUBLIC_SITE_URL` so
 * Next.js inlines the build-time value on the server too: reading it through a variable
 * (`env.NEXT_PUBLIC_SITE_URL`) would look it up at runtime, where a missing value silently
 * fell back to the production URL (and made a staging server indexable).
 */
const BUILD_SITE_URL: string | undefined = process.env.NEXT_PUBLIC_SITE_URL;

/** Env override for tests; the app always uses the build-time value. */
type SiteEnv = Partial<
  Record<'NEXT_PUBLIC_SITE_URL' | 'ALLOW_INDEXING' | 'CANONICAL_HOST', string>
>;

function configuredSiteUrl(env?: SiteEnv): string | undefined {
  return env ? env.NEXT_PUBLIC_SITE_URL : BUILD_SITE_URL;
}

/** Public origin without a trailing slash, e.g. "https://www.seshakart.com". */
export function siteUrl(env?: SiteEnv): string {
  return (configuredSiteUrl(env) ?? 'https://www.seshakart.com').replace(/\/+$/, '');
}

/** Absolute URL for a site path ("/product/x") or an already-absolute URL (CDN images). */
export function absoluteUrl(pathOrUrl: string, env?: SiteEnv): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl(env)}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/**
 * Whether search engines may index this deployment. Only the canonical production host
 * is indexable, so staging, preview and local builds can never leak into search results
 * even if they are publicly reachable. `ALLOW_INDEXING=false` switches production off too
 * (for example before launch). A build made without NEXT_PUBLIC_SITE_URL is never indexable.
 */
export function isIndexable(env?: SiteEnv): boolean {
  // ALLOW_INDEXING and CANONICAL_HOST are runtime settings (server only).
  const runtime: SiteEnv = env ?? {
    ALLOW_INDEXING: process.env.ALLOW_INDEXING,
    CANONICAL_HOST: process.env.CANONICAL_HOST,
  };
  if (runtime.ALLOW_INDEXING === 'false') return false;
  // A build without an explicit site URL is never indexable.
  const configured = configuredSiteUrl(env);
  if (!configured) return false;
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    return false;
  }
  const canonicalHost = runtime.CANONICAL_HOST ?? 'www.seshakart.com';
  return url.protocol === 'https:' && url.host === canonicalHost;
}

interface PageSeo {
  title: string;
  description?: string | null;
  /** Canonical site path, e.g. "/category/phones" or "/products?page=2". */
  path: string;
  images?: { url: string; width?: number; height?: number; alt?: string }[];
  /** Use the title exactly as given (no " | SeShaKart" suffix). */
  absoluteTitle?: boolean;
}

/**
 * Metadata for an indexable page: title, description, canonical URL and a complete Open
 * Graph block. Next.js replaces (not merges) a parent's `openGraph`, so every page must
 * send the site name, locale and image itself; this helper does that in one place.
 */
export function pageMetadata(p: PageSeo): Metadata {
  const description = p.description ?? undefined;
  return {
    title: p.absoluteTitle ? { absolute: p.title } : p.title,
    description,
    alternates: { canonical: p.path },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'en_IN',
      url: p.path,
      title: p.title,
      description,
      images: p.images?.length ? p.images : [DEFAULT_OG_IMAGE],
    },
  };
}

/**
 * Canonical path for a product listing. Filters and sort orders are views of the same
 * listing, so they point at the unfiltered URL; later pages keep their page number
 * (pointing page 2 at page 1 would hide its products from search engines).
 */
export function listingCanonical(basePath: string, raw: RawSearchParams): string {
  const value = Array.isArray(raw.page) ? raw.page[0] : raw.page;
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? `${basePath}?page=${page}` : basePath;
}

/** Store-page paths never listed in the sitemap or indexed. Mirrors robots.txt. */
export const PRIVATE_PATHS = [
  '/admin',
  '/account',
  '/cart',
  '/checkout',
  '/login',
  '/register',
  '/forgot-password',
  '/search',
  '/design-system',
  '/internal',
  '/api/',
];
