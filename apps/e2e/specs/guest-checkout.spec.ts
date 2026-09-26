import { expect, test } from '@playwright/test';
import { ADDRESS, PRODUCT, addToCart, fillCheckoutAddress, placeOrder } from '../support/helpers';

test.describe('guest shopper', () => {
  test('finds a product, pays cash on delivery and tracks the order @mobile', async ({ page }) => {
    // Search (typo-tolerant) → product page
    await page.goto('/search?q=powr+bank');
    await expect(page.getByText(/Showing results for/)).toBeVisible();
    await page.getByRole('link', { name: PRODUCT.name }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: PRODUCT.name })).toBeVisible();

    await addToCart(page);
    await page.goto('/cart');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/cart/i);
    await expect(page.getByText(PRODUCT.name).first()).toBeVisible();

    await page
      .getByRole('link', { name: /checkout/i })
      .first()
      .click();
    await page.waitForURL(/\/checkout$/);
    const email = `e2e-guest-${Date.now()}@example.com`;
    await fillCheckoutAddress(page, { email, phone: ADDRESS.phone });
    await page.getByLabel(/Cash on delivery/).check();
    const orderNumber = await placeOrder(page);

    await expect(page.getByText('Thank you! Your order is confirmed')).toBeVisible();
    await expect(page.getByText(orderNumber)).toBeVisible();

    // Tracking without an account
    await page.goto('/track-order');
    await page.getByLabel('Order number').fill(orderNumber);
    await page.getByLabel('Email or mobile number').fill(email);
    await page.getByRole('button', { name: 'Track order' }).click();
    await expect(page.getByText('Confirmed').first()).toBeVisible();
  });
});
