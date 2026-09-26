import { expect, test } from '@playwright/test';
import { PRODUCT, adminApiLogin, newCustomer, register } from '../support/helpers';

test.describe('security headers', () => {
  test('every page gets a fresh script nonce and no inline-script allowance', async ({
    request,
  }) => {
    const policies = [];
    for (let i = 0; i < 2; i++) {
      const res = await request.get('/');
      const csp = res.headers()['content-security-policy']!;
      const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src '))!;
      expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=]{20,}' 'strict-dynamic'/);
      expect(scriptSrc).not.toContain('unsafe-inline');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(res.headers()['x-content-type-options']).toBe('nosniff');
      expect(res.headers()['x-frame-options']).toBe('DENY');
      policies.push(scriptSrc);
      const html = await res.text();
      const nonce = /'nonce-([^']+)'/.exec(scriptSrc)![1]!;
      expect(html).toContain(`nonce="${nonce}"`);
    }
    expect(policies[0]).not.toBe(policies[1]);
  });

  test('an injected inline event handler never runs', async ({ page }) => {
    await page.goto('/');
    const ran = await page.evaluate(async () => {
      const div = document.createElement('div');
      div.innerHTML = '<img src="x" onerror="window.__pwned = 1">';
      document.body.append(div);
      await new Promise((r) => setTimeout(r, 300));
      return (window as unknown as { __pwned?: number }).__pwned ?? 0;
    });
    expect(ran).toBe(0);
  });
});

test.describe('access control', () => {
  test('the admin is closed to visitors and customers', async ({ page, request }) => {
    await page.goto('/admin/orders');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Forders/);

    await register(page, newCustomer('snoop'));
    const res = await page.goto('/admin');
    expect(res?.status()).toBe(404);
    const api = await page.request.get('/api/admin/orders');
    expect(api.status()).toBe(403);

    // Staff see it.
    await adminApiLogin(request);
    expect((await request.get('/api/admin/orders')).status()).toBe(200);
  });
});

test.describe('search engines', () => {
  test('a non-production host is closed to crawlers', async ({ request, page }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \/\s*$/m);
    expect(await (await request.get('/sitemap.xml')).text()).not.toContain('<loc>');
    await page.goto('/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('product pages carry canonical, Open Graph and Product structured data', async ({
    page,
  }) => {
    await page.goto(`/product/${PRODUCT.slug}?variant=anything`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      new RegExp(`/product/${PRODUCT.slug}$`),
    );
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      'content',
      PRODUCT.name,
    );
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = blocks
      .map((b) => JSON.parse(b))
      .flat()
      .find((d) => d['@type'] === 'Product');
    expect(product).toMatchObject({
      name: PRODUCT.name,
      offers: { priceCurrency: 'INR', availability: expect.stringMatching(/schema.org/) },
    });
  });

  test('unknown pages answer 404', async ({ page }) => {
    const res = await page.goto('/this-page-does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'We couldn’t find that page' }),
    ).toBeVisible();
  });
});
