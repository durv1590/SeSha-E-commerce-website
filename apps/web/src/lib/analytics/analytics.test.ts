import { describe, expect, it } from 'vitest';
import { parseConsent, readConsentCookie, serializeConsent, trackerCookieNames } from './consent';
import { toGa4, toMeta, type AnalyticsItem } from './events';
import { analyticsUrl, hasSensitiveParams } from './url';

describe('consent cookie', () => {
  it('round-trips and rejects unknown or outdated values', () => {
    const v = serializeConsent({ analytics: true, marketing: false });
    expect(v).toBe('v1.a1.m0');
    expect(parseConsent(v)).toEqual({ analytics: true, marketing: false });
    expect(parseConsent('v0.a1.m1')).toBeNull();
    expect(parseConsent('yes')).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
  });

  it('reads the choice from document.cookie', () => {
    expect(readConsentCookie('sk_csrf=abc; sk_consent=v1.a0.m1; _ga=GA1')).toEqual({
      analytics: false,
      marketing: true,
    });
    expect(readConsentCookie('sk_csrf=abc')).toBeNull();
  });

  it('knows which cookies belong to the tags', () => {
    expect(
      trackerCookieNames(['_ga', '_ga_ABC123', '_gid', '_fbp', 'sk_at', 'sk_consent', '_gaz']),
    ).toEqual(['_ga', '_ga_ABC123', '_gid', '_fbp']);
  });
});

describe('analyticsUrl', () => {
  const o = 'https://www.seshakart.com';
  it('keeps listing, search and campaign parameters only', () => {
    expect(analyticsUrl(o, '/search', '?q=earbuds&sort=price_asc&page=2')).toBe(
      `${o}/search?q=earbuds&sort=price_asc&page=2`,
    );
    expect(analyticsUrl(o, '/deals', '?utm_source=ig&token=secret&email=a%40b.c')).toBe(
      `${o}/deals?utm_source=ig`,
    );
    expect(analyticsUrl(o, '/checkout/success', '?order=SK2026000001')).toBe(
      `${o}/checkout/success`,
    );
  });

  it('hides order numbers in paths', () => {
    expect(analyticsUrl(o, '/account/orders/SK2026000001', '')).toBe(`${o}/account/orders/[order]`);
  });

  it('flags credential-like parameters', () => {
    expect(hasSensitiveParams('?token=x')).toBe(true);
    expect(hasSensitiveParams('?resetCode=1')).toBe(true);
    expect(hasSensitiveParams('?q=phone+case')).toBe(false);
    expect(hasSensitiveParams('?order=SK1&utm_source=x')).toBe(false);
  });
});

describe('event mapping', () => {
  const item: AnalyticsItem = {
    id: 'aurora-pods',
    name: 'Aurora Pods',
    variant: 'Black',
    brand: 'Aurora',
    category: 'Earbuds',
    price: 199_900,
    quantity: 2,
  };

  it('sends GA4 e-commerce events in rupees', () => {
    expect(toGa4({ name: 'add_to_cart', item })).toEqual([
      'add_to_cart',
      {
        currency: 'INR',
        value: 3998,
        items: [
          {
            item_id: 'aurora-pods',
            item_name: 'Aurora Pods',
            item_variant: 'Black',
            item_brand: 'Aurora',
            item_category: 'Earbuds',
            price: 1999,
            quantity: 2,
            index: 0,
          },
        ],
      },
    ]);
    const [name, p] = toGa4({
      name: 'purchase',
      orderNumber: 'SK2026000001',
      items: [item],
      value: 408_800,
      shipping: 4_000,
      tax: 60_983,
      coupon: 'WELCOME10',
    });
    expect(name).toBe('purchase');
    expect(p).toMatchObject({
      transaction_id: 'SK2026000001',
      value: 4088,
      shipping: 40,
      tax: 609.83,
      coupon: 'WELCOME10',
    });
  });

  it('maps to Meta standard events, de-duplicating purchases by order number', () => {
    expect(toMeta({ name: 'view_item', item })?.[0]).toBe('ViewContent');
    const purchase = toMeta({
      name: 'purchase',
      orderNumber: 'SK2026000001',
      items: [item],
      value: 408_800,
      shipping: 0,
      tax: 0,
    });
    expect(purchase).toEqual([
      'Purchase',
      expect.objectContaining({
        value: 4088,
        currency: 'INR',
        content_ids: ['aurora-pods'],
        num_items: 1,
      }),
      { eventID: 'SK2026000001' },
    ]);
    expect(toMeta({ name: 'login' })).toBeNull();
    expect(toMeta({ name: 'sign_up' })?.[0]).toBe('CompleteRegistration');
  });

  it('never carries more than 100 characters of a search', () => {
    const [, p] = toGa4({ name: 'search', query: 'x'.repeat(300) });
    expect((p.search_term as string).length).toBe(100);
  });
});
