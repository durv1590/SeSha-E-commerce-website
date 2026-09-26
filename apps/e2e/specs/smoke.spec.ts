import { expect, test } from '@playwright/test';

test('the stack is up: storefront renders live catalogue data @mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Electronics/ }).first()).toBeAttached();
});
