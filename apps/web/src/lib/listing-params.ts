/** Query-string handling for product listings (search text, filters, sort, page). */

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Params that the listing API understands; anything else is dropped. */
const ALLOWED = [
  'q',
  'category',
  'brand',
  'min',
  'max',
  'discount',
  'inStock',
  'featured',
  'sort',
  'page',
  'rating',
] as const;

/** Normalises Next.js searchParams (repeated keys → CSV) into URLSearchParams. */
export function toListingParams(
  raw: RawSearchParams,
  fixed: Record<string, string> = {},
): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of ALLOWED) {
    const value = raw[key];
    if (value === undefined || value === '') continue;
    const joined = (Array.isArray(value) ? value : [value])
      .flatMap((v) => v.split(','))
      .filter(Boolean)
      .join(',');
    if (joined) out.set(key, joined);
  }
  for (const [k, v] of Object.entries(fixed)) out.set(k, v);
  return out;
}

/** URL for the same listing with some params changed (null removes). Filter changes reset the page. */
export function listingHref(
  basePath: string,
  current: URLSearchParams,
  changes: Record<string, string | null>,
  fixedKeys: string[] = [],
): string {
  const next = new URLSearchParams(current);
  for (const k of fixedKeys) next.delete(k);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null || v === '') next.delete(k);
    else next.set(k, v);
  }
  if (!('page' in changes)) next.delete('page');
  const qs = next.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
