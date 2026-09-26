import { expect, test } from '@playwright/test';
import { PRODUCT, addToCart, fillCheckoutAddress, newCustomer, register } from '../support/helpers';

test.describe('registered customer', () => {
  test('saves to wishlist, pays online, then cancels and is refunded @mobile', async ({ page }) => {
    const customer = newCustomer('buyer');
    await register(page, customer);

    // Wishlist
    await page.goto(`/product/${PRODUCT.slug}`);
    const heart = page.getByRole('button', { name: /wishlist/i }).first();
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/account/wishlist');
    await expect(page.getByText(PRODUCT.name).first()).toBeVisible();

    // Online payment through the mock gateway
    await addToCart(page);
    await page.goto('/checkout');
    await fillCheckoutAddress(page);
    await page.getByRole('button', { name: /^Pay .* securely/ }).click();
    const gateway = page.getByRole('dialog');
    await gateway.getByRole('button', { name: /^Pay ₹/ }).click();
    await page.waitForURL(/\/checkout\/success\?order=SK\d+/);
    const orderNumber = new URL(page.url()).searchParams.get('order')!;
    await expect(page.getByText('We’ve received your payment.', { exact: false })).toBeVisible();

    // The order in the account, then cancel it
    await page.goto('/account/orders');
    await page
      .getByRole('link', { name: new RegExp(orderNumber) })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(orderNumber);
    await page.getByRole('button', { name: 'Cancel order' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cancel this order?' });
    await expect(dialog).toContainText('refunded to the original payment method');
    await dialog.getByLabel('Reason for cancelling').selectOption({ index: 1 });
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Cancelled').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Refunds' })).toBeVisible();
  });
});
