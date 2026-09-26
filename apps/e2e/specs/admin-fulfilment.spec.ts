import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN } from '../support/env';
import {
  PRODUCT,
  addToCart,
  fillCheckoutAddress,
  newCustomer,
  placeOrder,
  register,
} from '../support/helpers';

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/login?next=/admin');
  const form = page.getByRole('tabpanel', { name: 'Password' });
  await form.getByLabel('Email or mobile number').fill(ADMIN.email);
  await form.getByRole('textbox', { name: 'Password', exact: true }).fill(ADMIN.password);
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname === '/admin');
  return page;
}

test.describe('fulfilment and reviews', () => {
  test('staff dispatch and deliver an order; the customer reviews it; staff approve the review', async ({
    page,
    browser,
  }) => {
    // A customer orders with cash on delivery.
    const customer = newCustomer('reviewer');
    await register(page, customer);
    await addToCart(page);
    await page.goto('/checkout');
    await fillCheckoutAddress(page);
    await page.getByLabel(/Cash on delivery/).check();
    const orderNumber = await placeOrder(page);

    // Staff: the order is in the "to ship" queue; dispatch it, then mark it delivered.
    const admin = await adminPage(browser);
    await expect(admin.getByRole('heading', { level: 1 })).toBeVisible();
    await admin.goto('/admin/orders?status=to_ship');
    await admin.getByRole('link', { name: orderNumber }).click();
    await admin.getByRole('button', { name: 'Dispatch' }).click();
    const ship = admin.getByRole('dialog', { name: 'Dispatch order' });
    await ship.getByLabel('Tracking number').fill(`E2E${Date.now()}`);
    await ship.getByRole('button', { name: 'Dispatch' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Order dispatched' })).toBeVisible();
    await expect(admin.getByRole('link', { name: /invoice/i }).first()).toBeVisible();

    await admin.getByRole('button', { name: 'Add tracking update' }).click();
    const update = admin.getByRole('dialog', { name: 'Add tracking update' });
    await update.getByLabel('Update').selectOption('DELIVERED');
    await update.getByRole('button', { name: 'Add update' }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Tracking updated' })).toBeVisible();
    await expect(admin.getByText('Delivered').first()).toBeVisible();

    // The customer sees the delivery and writes a review (verified purchase).
    await page.goto(`/account/orders/${orderNumber}`);
    await expect(page.getByText('Delivered').first()).toBeVisible();
    await page.goto(`/product/${PRODUCT.slug}`);
    await page.getByRole('button', { name: 'Write a review' }).click();
    const form = page.getByRole('dialog', { name: 'Write a review' });
    // Keyboard, as a screen-reader or keyboard user would pick the rating.
    const fourStars = form.getByRole('radio', { name: '4 stars' });
    await fourStars.focus();
    await page.keyboard.press('Space');
    await expect(fourStars).toBeChecked();
    await form.getByLabel('Title').fill('Charges my phone three times');
    await form
      .getByLabel('Your review')
      .fill('Solid build and fast charging. A little heavy but worth it.');
    await form.getByRole('button', { name: 'Submit review' }).click();
    await expect(form).toBeHidden();

    // Staff approve it; it appears on the product page with the rating.
    await admin.goto('/admin/reviews');
    const row = admin.getByRole('listitem').filter({ hasText: 'Charges my phone three times' });
    await row.getByRole('button', { name: /Approve/ }).click();
    await expect(row).toHaveCount(0); // leaves the "To moderate" queue
    await admin.getByRole('link', { name: 'Approved', exact: true }).click();
    await expect(
      admin.getByRole('listitem').filter({ hasText: 'Charges my phone three times' }),
    ).toContainText(/Approved by/);

    await page.goto(`/product/${PRODUCT.slug}`);
    await expect(page.getByText('Charges my phone three times')).toBeVisible();
    await expect(page.getByText('Verified purchase').first()).toBeVisible();
  });
});
