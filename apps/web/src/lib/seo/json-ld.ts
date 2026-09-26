import type { ProductDetail, ReviewDto, ReviewSummaryDto } from '@seshakart/types';
import { absoluteUrl, SITE_NAME } from './site';

/**
 * schema.org structured data (JSON-LD) for search engines. Builders are pure; render
 * them with <JsonLd>. Only facts shown on the page are marked up (Google requires it).
 */

type Thing = Record<string, unknown>;

/**
 * JSON for embedding in a <script> element. "<" is escaped so text such as a product
 * description containing "</script>" can never close the element early; the line
 * separators U+2028/2029 are escaped for old parsers.
 */
export function serializeJsonLd(data: Thing | Thing[]): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const rupees = (paise: number) => (paise / 100).toFixed(2);
const ORG_ID = () => absoluteUrl('/#organization');

export function organizationJsonLd(s: {
  storeName: string;
  legalName: string;
  supportEmail: string;
  supportPhone: string;
}): Thing {
  const phone = s.supportPhone.replace(/[^\d+]/g, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'OnlineStore',
    '@id': ORG_ID(),
    name: s.storeName,
    legalName: s.legalName,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/brand/logo/seshakart-icon-provisional.png'),
    image: absoluteUrl('/brand/social/og-default.jpg'),
    email: s.supportEmail,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: s.supportEmail,
      ...(phone ? { telephone: phone.startsWith('+') ? phone : `+91${phone.slice(-10)}` } : {}),
      areaServed: 'IN',
      availableLanguage: ['en', 'hi'],
    },
  };
}

/** WebSite with the sitelinks search box pointing at /search. */
export function websiteJsonLd(): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absoluteUrl('/'),
    publisher: { '@id': ORG_ID() },
    inLanguage: 'en-IN',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${absoluteUrl('/search')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** BreadcrumbList. Every item needs a URL; the last one is the current page. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]): Thing {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

const AVAILABILITY = {
  in_stock: 'https://schema.org/InStock',
  low_stock: 'https://schema.org/LimitedAvailability',
  out_of_stock: 'https://schema.org/OutOfStock',
} as const;

/** Product with offers, return policy, rating and a few approved reviews. */
export function productJsonLd(
  p: ProductDetail,
  reviews?: { summary: ReviewSummaryDto; reviews: ReviewDto[] },
): Thing {
  const url = absoluteUrl(`/product/${p.slug}`);
  const variants = p.variants.length ? p.variants : [];
  const anyInStock = variants.some((v) => v.stock !== 'out_of_stock');
  const returnPolicy = p.isReturnable
    ? {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'IN',
        returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
        merchantReturnDays: p.returnWindowDays,
      }
    : {
        '@type': 'MerchantReturnPolicy',
        applicableCountry: 'IN',
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted',
      };
  const seller = { '@type': 'Organization', '@id': ORG_ID(), name: SITE_NAME };

  let offers: Thing | undefined;
  if (variants.length === 1) {
    const v = variants[0]!;
    offers = {
      '@type': 'Offer',
      url,
      sku: v.sku,
      priceCurrency: 'INR',
      price: rupees(v.price),
      availability: AVAILABILITY[v.stock],
      itemCondition: 'https://schema.org/NewCondition',
      hasMerchantReturnPolicy: returnPolicy,
      seller,
    };
  } else if (variants.length > 1) {
    const prices = variants.map((v) => v.price);
    offers = {
      '@type': 'AggregateOffer',
      url,
      priceCurrency: 'INR',
      lowPrice: rupees(Math.min(...prices)),
      highPrice: rupees(Math.max(...prices)),
      offerCount: variants.length,
      availability: anyInStock ? AVAILABILITY.in_stock : AVAILABILITY.out_of_stock,
      itemCondition: 'https://schema.org/NewCondition',
      hasMerchantReturnPolicy: returnPolicy,
      seller,
    };
  }

  const count = reviews?.summary.count ?? p.ratingCount;
  const average = reviews?.summary.average ?? p.ratingAvg;
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    url,
    name: p.name,
    description: (p.shortDescription || p.description).slice(0, 5000),
    sku: p.sku,
    image: p.images.map((i) => absoluteUrl(i.url)),
    ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand.name } } : {}),
    category: p.breadcrumbs.map((b) => b.name).join(' > ') || p.category.name,
    ...(offers ? { offers } : {}),
    ...(count > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: Math.round(average * 10) / 10,
            reviewCount: count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(reviews?.reviews.length
      ? {
          review: reviews.reviews.slice(0, 5).map((r) => ({
            '@type': 'Review',
            author: { '@type': 'Person', name: r.author },
            datePublished: r.createdAt.slice(0, 10),
            reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
            ...(r.title ? { name: r.title } : {}),
            reviewBody: r.body,
          })),
        }
      : {}),
  };
}
