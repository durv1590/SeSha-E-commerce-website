import { describe, expect, it } from 'vitest';
import { mergeSeo } from './seo';

const base = { title: 'Deals', description: 'Base', alternates: { canonical: '/deals' } };

describe('mergeSeo', () => {
  it('keeps the base when there is no override', () => {
    expect(mergeSeo(base, null)).toBe(base);
  });
  it('overrides title, description, image and indexing', () => {
    expect(
      mergeSeo(base, {
        path: '/deals',
        title: 'Top deals today',
        description: null,
        ogImage: '/api/media/og.webp',
        noindex: true,
      }),
    ).toEqual({
      title: { absolute: 'Top deals today' },
      description: 'Base',
      alternates: { canonical: '/deals' },
      openGraph: { title: 'Top deals today', images: [{ url: '/api/media/og.webp' }] },
      robots: { index: false, follow: true },
    });
  });
});
