import type { ProductDetail, VariantDto } from '@seshakart/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  breadcrumbJsonLd,
  organizationJsonLd,
  productJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from './json-ld';

const saved = process.env.NEXT_PUBLIC_SITE_URL;
beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.seshakart.com';
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = saved;
});

const variant = (over: Partial<VariantDto>): VariantDto => ({
  id: 'v1',
  sku: 'SKU-1',
  name: 'Default',
  options: {},
  mrp: 499_900,
  price: 199_900,
  available: 10,
  stock: 'in_stock',
  isDefault: true,
  imageIds: [],
  ...over,
});

const product = (over: Partial<ProductDetail> = {}): ProductDetail =>
  ({
    id: 'p1',
    slug: 'aurora-pods',
    name: 'Aurora Pods',
    brand: { id: 'b1', name: 'Aurora', slug: 'aurora' },
    category: { id: 'c3', name: 'Earbuds', slug: 'earbuds' },
    breadcrumbs: [
      { id: 'c1', name: 'Electronics', slug: 'electronics' },
      { id: 'c3', name: 'Earbuds', slug: 'earbuds' },
    ],
    sku: 'POD',
    shortDescription: 'Wireless earbuds',
    description: 'Long description',
    images: [{ id: 'i1', url: '/api/media/p/pods.webp', alt: 'Pods', width: 1000, height: 1000 }],
    variants: [variant({})],
    ratingAvg: 4.26,
    ratingCount: 12,
    isReturnable: true,
    returnWindowDays: 7,
    ...over,
  }) as ProductDetail;

describe('serializeJsonLd', () => {
  it('cannot be broken out of the script element', () => {
    const out = serializeJsonLd({ description: '</script><script>alert(1)</script> & \u2028' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain(String.fromCharCode(0x2028));
    expect(out).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(out)).toEqual({ description: '</script><script>alert(1)</script> & \u2028' });
  });
});

describe('site-wide entities', () => {
  it('describes the store with an international support number', () => {
    const org = organizationJsonLd({
      storeName: 'SeShaKart',
      legalName: 'SeShaKart Pvt. Ltd.',
      supportEmail: 'help@seshakart.com',
      supportPhone: '82183 97819',
    });
    expect(org).toMatchObject({
      '@type': 'OnlineStore',
      '@id': 'https://www.seshakart.com/#organization',
      url: 'https://www.seshakart.com/',
      contactPoint: { telephone: '+918218397819', email: 'help@seshakart.com' },
    });
  });

  it('points the sitelinks search box at /search', () => {
    expect(websiteJsonLd()).toMatchObject({
      potentialAction: {
        target: { urlTemplate: 'https://www.seshakart.com/search?q={search_term_string}' },
        'query-input': 'required name=search_term_string',
      },
    });
  });

  it('numbers breadcrumb items from 1 with absolute URLs', () => {
    expect(
      breadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Audio', path: '/category/audio' },
      ]).itemListElement,
    ).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.seshakart.com/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Audio',
        item: 'https://www.seshakart.com/category/audio',
      },
    ]);
  });
});

describe('productJsonLd', () => {
  it('marks up a single-variant product as one Offer in rupees', () => {
    const ld = productJsonLd(product());
    expect(ld).toMatchObject({
      '@type': 'Product',
      name: 'Aurora Pods',
      sku: 'POD',
      image: ['https://www.seshakart.com/api/media/p/pods.webp'],
      brand: { '@type': 'Brand', name: 'Aurora' },
      category: 'Electronics > Earbuds',
      offers: {
        '@type': 'Offer',
        price: '1999.00',
        priceCurrency: 'INR',
        availability: 'https://schema.org/InStock',
        url: 'https://www.seshakart.com/product/aurora-pods',
        hasMerchantReturnPolicy: { merchantReturnDays: 7, applicableCountry: 'IN' },
      },
      aggregateRating: { ratingValue: 4.3, reviewCount: 12 },
    });
  });

  it('uses an AggregateOffer across variants and reflects stock', () => {
    const ld = productJsonLd(
      product({
        isReturnable: false,
        variants: [
          variant({ id: 'a', price: 279_900, stock: 'out_of_stock' }),
          variant({ id: 'b', price: 299_900, stock: 'out_of_stock' }),
        ],
      }),
    );
    expect(ld.offers).toMatchObject({
      '@type': 'AggregateOffer',
      lowPrice: '2799.00',
      highPrice: '2999.00',
      offerCount: 2,
      availability: 'https://schema.org/OutOfStock',
      hasMerchantReturnPolicy: {
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
      },
    });
  });

  it('omits ratings without reviews and includes shown reviews', () => {
    expect(productJsonLd(product({ ratingCount: 0, ratingAvg: 0 }))).not.toHaveProperty(
      'aggregateRating',
    );
    const ld = productJsonLd(product(), {
      summary: { average: 5, count: 1, distribution: [0, 0, 0, 0, 1] },
      reviews: [
        {
          id: 'r1',
          rating: 5,
          title: 'Great',
          body: 'Loved it',
          author: 'Asha R.',
          isVerifiedPurchase: true,
          createdAt: '2026-09-01T10:00:00.000Z',
        },
      ],
    });
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 5, reviewCount: 1 });
    expect(ld.review).toEqual([
      {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Asha R.' },
        datePublished: '2026-09-01',
        reviewRating: { '@type': 'Rating', ratingValue: 5, bestRating: 5 },
        name: 'Great',
        reviewBody: 'Loved it',
      },
    ]);
  });
});
