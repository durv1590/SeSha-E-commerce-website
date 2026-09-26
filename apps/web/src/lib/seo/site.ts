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

/** Public origin without a trailing slash, e.g. "https://www.seshakart.com". */
export function siteUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.NEXT_PUBLIC_SITE_URL ?? 'https://www.seshakart.com').replace(/\/+$/, '');
}

/** Absolute URL for a site path ("/product/x") or an already-absolute URL (CDN images). */
export function absoluteUrl(pathOrUrl: string, env: NodeJS.ProcessEnv = process.env): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${siteUrl(env)}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

/**
 * Whether search engines may index this deployment. Only the canonical production host
 * is indexable, so staging, preview and local builds can never leak into search results
 * even if they are publicly reachable. `ALLOW_INDEXING=false` switches production off too
 * (for example before launch).
 */
export function isIndexable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.ALLOW_INDEXING === 'false') return false;
  let url: URL;
  try {
    url = new URL(siteUrl(env));
  } catch {
    return false;
  }
  const canonicalHost = env.CANONICAL_HOST ?? 'www.seshakart.com';
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
