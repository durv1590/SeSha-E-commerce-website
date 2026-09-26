import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN } from './env';

/** Demo-catalogue products used by the journeys (seeded by seed-demo). */
export const PRODUCT = {
  slug: 'voltix-powermax-20000-mah-power-bank',
  name: 'Voltix PowerMax 20000 mAh Power Bank',
};

let n = 0;
/** A unique customer for this run (the database is new every run). */
export function newCustomer(tag: string) {
  const id = `${Date.now().toString(36)}${n++}`;
  return {
    name: `E2E ${tag} ${id}`.slice(0, 40),
    email: `e2e-${tag}-${id}@example.com`,
    phone: `9${String(Date.now() + n).slice(-9)}`,
    password: `Tulsi-garden-${id}`,
  };
}

export const ADDRESS = {
  name: 'Asha Rao',
  phone: '9876543210',
  line1: '12, MG Road',
  pincode: '411001',
  city: 'Pune',
  state: 'Maharashtra',
};

export async function addToCart(page: Page, slug = PRODUCT.slug) {
  await page.goto(`/product/${slug}`);
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to cart' })).toBeVisible();
}

/** Fills the new-address form on /checkout (guests, or members without saved addresses). */
export async function fillCheckoutAddress(page: Page, contact?: { email: string; phone: string }) {
  if (contact) {
    await page.locator('[name="contact.email"]').fill(contact.email);
    await page.locator('[name="contact.phone"]').fill(contact.phone);
  }
  await page.locator('[name="shipping.name"]').fill(ADDRESS.name);
  await page.locator('[name="shipping.phone"]').fill(ADDRESS.phone);
  await page.locator('[name="shipping.line1"]').fill(ADDRESS.line1);
  await page.locator('[name="shipping.pincode"]').fill(ADDRESS.pincode);
  await page.locator('[name="shipping.city"]').fill(ADDRESS.city);
  await page.locator('[name="shipping.state"]').selectOption(ADDRESS.state);
}

/** Submits checkout and returns the new order number from the confirmation URL. */
export async function placeOrder(page: Page): Promise<string> {
  const submit = page.getByRole('button', { name: /^(Place order|Pay .* securely)/ });
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL(/\/checkout\/success\?order=SK\d+/);
  return new URL(page.url()).searchParams.get('order')!;
}

export async function register(page: Page, c: ReturnType<typeof newCustomer>) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill(c.name);
  await page.getByLabel('Email address').fill(c.email);
  await page.getByLabel('Mobile number').fill(c.phone);
  await page.getByLabel('Create a password').fill(c.password);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/register'));
}

/** Signs in as the e2e admin through the API (UI sign-in has its own test). */
export async function adminApiLogin(request: APIRequestContext) {
  await request.get('/api/auth/csrf');
  const state = await request.storageState();
  const csrf = state.cookies.find((c) => c.name === 'sk_csrf')!.value;
  const res = await request.post('/api/auth/login', {
    headers: { 'x-csrf-token': csrf },
    data: { identifier: ADMIN.email, password: ADMIN.password },
  });
  expect(res.status()).toBe(200);
  return csrf;
}
