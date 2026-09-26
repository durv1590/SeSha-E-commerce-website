import { serializeJsonLd } from '@/lib/seo/json-ld';

/** Structured data for search engines. Not executed by browsers (non-JS script type). */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
