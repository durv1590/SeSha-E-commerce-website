import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN } from '../support/env';
import { PRODUCT, addToCart, adminApiLogin } from '../support/helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map(
    (v) => `${v.id} (${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`,
  );
  expect(summary, `${label}: axe violations`).toEqual([]);
}

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  const storefront = [
    ['/', 'home'],
    ['/categories', 'all categories'],
    ['/category/electronics', 'category listing'],
    ['/search?q=earbuds', 'search results'],
    [`/product/${PRODUCT.slug}`, 'product'],
    ['/login', 'sign in'],
    ['/register', 'register'],
    ['/track-order', 'track order'],
  ] as const;
  for (const [path, label] of storefront) {
    test(`${label} @mobile`, async ({ page }) => {
      await page.goto(path);
      await audit(page, label);
    });
  }

  test('cart and checkout with an item @mobile', async ({ page }) => {
    await addToCart(page);
    await page.goto('/cart');
    await expect(page.getByText(PRODUCT.name).first()).toBeVisible();
    await audit(page, 'cart');
    await page.goto('/checkout');
    await expect(page.locator('#checkout-summary')).toBeVisible();
    await audit(page, 'checkout');
  });

  test('admin dashboard and orders', async ({ page }) => {
    await adminApiLogin(page.request);
    for (const [path, label] of [
      ['/admin', 'admin dashboard'],
      ['/admin/orders', 'admin orders'],
      ['/admin/products', 'admin products'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await audit(page, label);
    }
    expect(ADMIN.email).toContain('@');
  });
});
