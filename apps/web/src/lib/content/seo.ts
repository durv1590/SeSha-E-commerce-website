import type { SeoOverrideDto } from '@seshakart/types';
import type { Metadata } from 'next';

/**
 * Applies an admin SEO override to a page's metadata. The override title is used
 * exactly as written (no " | SeShaKart" suffix), and "hide from search engines"
 * adds noindex while still letting crawlers follow links.
 */
export function mergeSeo(base: Metadata, o: SeoOverrideDto | null | undefined): Metadata {
  if (!o) return base;
  const out: Metadata = { ...base };
  if (o.title) out.title = { absolute: o.title };
  if (o.description) out.description = o.description;
  if (o.title || o.description || o.ogImage)
    out.openGraph = {
      ...(base.openGraph ?? {}),
      ...(o.title ? { title: o.title } : {}),
      ...(o.description ? { description: o.description } : {}),
      ...(o.ogImage ? { images: [{ url: o.ogImage }] } : {}),
    };
  if (o.noindex) out.robots = { index: false, follow: true };
  return out;
}
