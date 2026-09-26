/**
 * The page address sent to analytics. Only listing and search parameters survive:
 * order numbers, one-time tokens, redirect targets and anything else a query string
 * may carry never leave the site.
 */
const KEEP = new Set([
  'q',
  'category',
  'brand',
  'min',
  'max',
  'discount',
  'inStock',
  'featured',
  'rating',
  'sort',
  'page',
  'variant',
  // Campaign attribution.
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
]);

export function analyticsUrl(origin: string, pathname: string, search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const [k, v] of params) if (KEEP.has(k)) kept.append(k, v.slice(0, 100));
  // Order and review pages carry identifiers in the path; report the section instead.
  const path = pathname
    .replace(/^\/account\/orders\/[^/]+/, '/account/orders/[order]')
    .replace(/^\/track-order\/[^/]+/, '/track-order/[order]');
  const qs = kept.toString();
  return `${origin}${path}${qs ? `?${qs}` : ''}`;
}

/**
 * True when the address carries something credential-like. Meta's pixel always reports
 * the real page address, so it sends nothing at all from such a page.
 */
export function hasSensitiveParams(search: string): boolean {
  return [...new URLSearchParams(search).keys()].some((k) =>
    /token|code|otp|key|secret|pass|email|phone/i.test(k),
  );
}
