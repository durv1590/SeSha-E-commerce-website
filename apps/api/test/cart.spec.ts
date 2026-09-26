import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { CacheService } from '../src/cache/cache.service';
import { CartService } from '../src/cart/cart.service';
import { createTestApp } from './helpers/app';
import { browser, cookieNames, type BrowserClient } from './helpers/client';
import { truncateAll } from './helpers/db';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const PASSWORD = 'Tulsi-garden-42';

/**
 * Fixture (store defaults: max 10 per item, free delivery from ₹499, else ₹49):
 *   audio     : pods  (₹1,999 / MRP ₹4,999, stock 10)
 *               boom  (Blue ₹2,799 stock 3 · Orange ₹2,999 stock 20)
 *               cable (₹199 / MRP ₹399, stock 100, GST 18%)
 *               draft (DRAFT)
 *   hidden (inactive category): secret
 */
async function fixture() {
  const audio = await prisma.category.create({ data: { slug: 'audio', name: 'Audio' } });
  const hidden = await prisma.category.create({
    data: { slug: 'hidden', name: 'Hidden', isActive: false },
  });
  let n = 0;
  const product = async (
    slug: string,
    categoryId: string,
    variants: { price: number; mrp: number; stock: number; name?: string }[],
    status: 'ACTIVE' | 'DRAFT' = 'ACTIVE',
  ) => {
    const p = await prisma.product.create({
      data: {
        slug,
        name: slug[0]!.toUpperCase() + slug.slice(1),
        sku: `SKU-${++n}`,
        categoryId,
        status,
        publishedAt: new Date(),
        variants: {
          create: variants.map((v, i) => ({
            sku: `SKU-${n}-${i}`,
            name: v.name ?? 'Default',
            options: v.name ? { Colour: v.name } : {},
            price: v.price * 100,
            mrp: v.mrp * 100,
            isDefault: i === 0,
            position: i,
            inventory: { create: { stock: v.stock } },
          })),
        },
      },
      include: { variants: { orderBy: { position: 'asc' } } },
    });
    return { id: p.id, variants: p.variants.map((v) => v.id) };
  };
  return {
    audio,
    pods: await product('pods', audio.id, [{ price: 1999, mrp: 4999, stock: 10 }]),
    boom: await product('boom', audio.id, [
      { price: 2799, mrp: 4999, stock: 3, name: 'Blue' },
      { price: 2999, mrp: 4999, stock: 20, name: 'Orange' },
    ]),
    cable: await product('cable', audio.id, [{ price: 199, mrp: 399, stock: 100 }]),
    draft: await product('draft', audio.id, [{ price: 100, mrp: 100, stock: 5 }], 'DRAFT'),
    secret: await product('secret', hidden.id, [{ price: 100, mrp: 100, stock: 5 }]),
  };
}

describe('cart and wishlist (integration)', () => {
  let app: INestApplication;
  let f: Awaited<ReturnType<typeof fixture>>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    await app.get(CacheService).delByPrefix('catalog:');
    await app.get(CacheService).delByPrefix('settings:');
    f = await fixture();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function signUp(email: string, c?: BrowserClient): Promise<BrowserClient> {
    const client = c ?? (await browser(app));
    await client
      .post('/api/auth/register', { name: 'Asha Rao', email, password: PASSWORD })
      .expect(201);
    return client;
  }
  const add = (c: BrowserClient, variantId: string, quantity = 1) =>
    c.post('/api/cart/items', { variantId, quantity });

  describe('guest cart', () => {
    it('starts empty without creating anything, then creates a cart on first add', async () => {
      const c = await browser(app);
      const empty = await c.get('/api/cart').expect(200);
      expect(empty.body.data).toMatchObject({ id: null, items: [], canCheckout: false });
      expect(empty.headers['cache-control']).toBe('no-store');
      expect(cookieNames(empty).sk_cart).toBeUndefined();

      const res = await add(c, f.pods.variants[0]!, 2).expect(201);
      const cookie = cookieNames(res).sk_cart!;
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api/);
      expect(cookie).toMatch(/SameSite=Lax/i);
      const cart = res.body.data;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({
        name: 'Pods',
        quantity: 2,
        price: 199_900,
        mrp: 499_900,
        lineTotal: 399_800,
        maxQuantity: 10,
        issue: null,
        variantName: null,
      });
      expect(cart.totals).toMatchObject({
        itemCount: 2,
        mrpTotal: 999_800,
        subtotal: 399_800,
        productDiscount: 600_000,
        shippingFee: 0,
        total: 399_800,
        taxIncluded: Math.round((399_800 * 18) / 118),
      });
      expect(cart.canCheckout).toBe(true);
      expect((await c.get('/api/cart/summary').expect(200)).body.data).toEqual({ count: 2 });
      // Only a keyed hash of the guest token is stored.
      const token = res.headers['set-cookie']!.toString().match(/sk_cart=([^;]+)/)![1]!;
      const row = await prisma.cart.findFirstOrThrow();
      expect(row.guestTokenHash).not.toContain(token);
      expect(row.guestTokenHash).toHaveLength(64);
    });

    it('never trusts prices from the client and charges delivery below the threshold', async () => {
      const c = await browser(app);
      const res = await c
        .post('/api/cart/items', { variantId: f.cable.variants[0], quantity: 1, price: 1 })
        .expect(201);
      expect(res.body.data.totals).toMatchObject({
        subtotal: 19_900,
        shippingFee: 4_900,
        total: 24_800,
        freeShippingRemaining: 30_000,
      });
    });

    it('adds up repeated adds and enforces stock and the per-item limit', async () => {
      const c = await browser(app);
      await add(c, f.boom.variants[0]!, 2).expect(201);
      const more = await add(c, f.boom.variants[0]!, 2).expect(409);
      expect(more.body.error).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        message: 'Only 3 left in stock.',
      });
      await add(c, f.boom.variants[0]!, 1).expect(201);
      const limit = await add(c, f.boom.variants[1]!, 100).expect(422); // above the absolute max of 99
      expect(limit.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('applies the admin per-item limit', async () => {
      const c = await browser(app);
      const res = await add(c, f.boom.variants[1]!, 11).expect(409);
      expect(res.body.error).toMatchObject({
        code: 'QUANTITY_LIMIT',
        message: 'You can buy up to 10 of this item per order.',
      });
    });

    it('rejects withdrawn, hidden, unknown and out-of-stock products', async () => {
      const c = await browser(app);
      for (const id of [f.draft.variants[0]!, f.secret.variants[0]!, 'nosuchvariant']) {
        const res = await add(c, id).expect(404);
        expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
      }
      await prisma.inventory.updateMany({
        where: { variantId: f.pods.variants[0] },
        data: { stock: 0 },
      });
      expect((await add(c, f.pods.variants[0]!).expect(409)).body.error.code).toBe('OUT_OF_STOCK');
      await add(c, 'bad id!').expect(422);
    });

    it('updates quantities, saves for later, moves back and removes lines', async () => {
      const c = await browser(app);
      await add(c, f.pods.variants[0]!).expect(201);
      const cart = (await add(c, f.cable.variants[0]!, 3).expect(201)).body.data;
      const cable = cart.items.find((i: { name: string }) => i.name === 'Cable');

      let res = await c.patch(`/api/cart/items/${cable.id}`, { quantity: 5 }).expect(200);
      expect(res.body.data.totals.itemCount).toBe(6);

      res = await c.patch(`/api/cart/items/${cable.id}`, { savedForLater: true }).expect(200);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.savedForLater).toEqual([
        expect.objectContaining({ name: 'Cable', savedForLater: true }),
      ]);
      expect(res.body.data.totals).toMatchObject({ itemCount: 1, subtotal: 199_900 });
      expect((await c.get('/api/cart/summary')).body.data.count).toBe(1);

      res = await c.patch(`/api/cart/items/${cable.id}`, { savedForLater: false }).expect(200);
      expect(res.body.data.items).toHaveLength(2);

      await c.patch(`/api/cart/items/${cable.id}`, { quantity: 11 }).expect(409);
      await c.patch(`/api/cart/items/${cable.id}`, {}).expect(422);

      res = await c.delete(`/api/cart/items/${cable.id}`).expect(200);
      expect(res.body.data.items.map((i: { name: string }) => i.name)).toEqual(['Pods']);
      await c.delete(`/api/cart/items/${cable.id}`).expect(404);
    });

    it("can't read or change another shopper's cart lines", async () => {
      const a = await browser(app);
      const b = await browser(app);
      const line = (await add(a, f.pods.variants[0]!).expect(201)).body.data.items[0];
      await add(b, f.cable.variants[0]!).expect(201);
      await b.patch(`/api/cart/items/${line.id}`, { quantity: 2 }).expect(404);
      await b.delete(`/api/cart/items/${line.id}`).expect(404);
      expect((await a.get('/api/cart')).body.data.items[0].quantity).toBe(1);
      // A forged token finds nothing.
      const forged = await request(app.getHttpServer())
        .get('/api/cart')
        .set('Cookie', `sk_cart=${'A'.repeat(43)}`)
        .expect(200);
      expect(forged.body.data.items).toEqual([]);
    });

    it('flags lines whose stock or availability changed, and blocks checkout', async () => {
      const c = await browser(app);
      await add(c, f.boom.variants[0]!, 3).expect(201);
      await add(c, f.pods.variants[0]!).expect(201);
      await prisma.inventory.updateMany({
        where: { variantId: f.boom.variants[0] },
        data: { reserved: 2 },
      });
      let cart = (await c.get('/api/cart')).body.data;
      const boom = cart.items.find((i: { name: string }) => i.name === 'Boom');
      expect(boom).toMatchObject({
        issue: 'INSUFFICIENT_STOCK',
        maxQuantity: 1,
        variantName: 'Blue',
      });
      expect(cart.canCheckout).toBe(false);
      expect(cart.totals.subtotal).toBe(199_900); // flagged lines are not charged

      await c.patch(`/api/cart/items/${boom.id}`, { quantity: 1 }).expect(200);
      expect((await c.get('/api/cart')).body.data.canCheckout).toBe(true);

      await prisma.product.update({ where: { id: f.pods.id }, data: { status: 'ARCHIVED' } });
      cart = (await c.get('/api/cart')).body.data;
      expect(cart.items.find((i: { name: string }) => i.name === 'Pods')).toMatchObject({
        issue: 'UNAVAILABLE',
        maxQuantity: 0,
      });
      expect(cart.canCheckout).toBe(false);
    });

    it('supports native apps with a token header instead of a cookie', async () => {
      const server = app.getHttpServer();
      const first = await request(server)
        .post('/api/cart/items')
        .set('X-Client-Type', 'app')
        .send({ variantId: f.pods.variants[0] })
        .expect(201);
      const token = first.headers['x-cart-token'] as string;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(cookieNames(first).sk_cart).toBeUndefined();
      const again = await request(server)
        .get('/api/cart')
        .set('X-Client-Type', 'app')
        .set('X-Cart-Token', token)
        .expect(200);
      expect(again.body.data.items).toHaveLength(1);
    });

    it('requires the CSRF token once a browser holds a cart cookie', async () => {
      const c = await browser(app);
      await add(c, f.pods.variants[0]!).expect(201);
      const res = await c.agent
        .post('/api/cart/items')
        .set('X-Client-Type', 'app')
        .send({ variantId: f.cable.variants[0] })
        .expect(403);
      expect(res.body.error.code).toBe('CSRF_FAILED');
    });
  });

  describe('coupons', () => {
    const coupon = (code: string, data: object = {}) =>
      prisma.coupon.create({ data: { code, type: 'PERCENTAGE', value: 10, ...data } });

    it('applies a valid coupon (case-insensitive), re-checks it on every read, and removes it', async () => {
      await coupon('SAVE10', { minCartValue: 300_000, description: '10% off above ₹3,000' });
      const c = await browser(app);
      const line = (await add(c, f.pods.variants[0]!, 2).expect(201)).body.data.items[0];
      const res = await c.post('/api/cart/coupon', { code: ' save10 ' }).expect(201);
      expect(res.body.data.coupon).toEqual({
        code: 'SAVE10',
        valid: true,
        discount: 39_980,
        message: '10% off above ₹3,000',
      });
      expect(res.body.data.totals).toMatchObject({ couponDiscount: 39_980, total: 359_820 });

      // Dropping below the minimum keeps the code but stops the discount.
      const shrunk = await c.patch(`/api/cart/items/${line.id}`, { quantity: 1 }).expect(200);
      expect(shrunk.body.data.coupon).toMatchObject({ valid: false, discount: 0 });
      expect(shrunk.body.data.coupon.message).toContain('Add ₹1,001 more');
      expect(shrunk.body.data.totals.couponDiscount).toBe(0);

      const removed = await c.delete('/api/cart/coupon').expect(200);
      expect(removed.body.data.coupon).toBeNull();
    });

    it('rejects unknown, expired and ineligible coupons with clear messages', async () => {
      await coupon('OLD', { endsAt: new Date(Date.now() - 1000) });
      await coupon('FIRST', { firstOrderOnly: true });
      await coupon('CABLES', { productIds: [f.cable.id] });
      const c = await browser(app);
      await c.post('/api/cart/coupon', { code: 'SAVE10' }).expect(422); // empty cart
      await add(c, f.pods.variants[0]!).expect(201);
      const cases: [string, string][] = [
        ['NOPE', 'This coupon code isn’t valid.'],
        ['OLD', 'This coupon has expired.'],
        ['FIRST', 'Sign in to use this coupon.'],
        ['CABLES', 'This coupon doesn’t apply to the items in your cart.'],
      ];
      for (const [code, message] of cases) {
        const res = await c.post('/api/cart/coupon', { code }).expect(422);
        expect(res.body.error).toMatchObject({ code: 'COUPON_INVALID', message });
      }
      await c.post('/api/cart/coupon', { code: 'x' }).expect(422);
      expect((await c.get('/api/cart')).body.data.coupon).toBeNull();
    });

    it('applies customer and first-order coupons to eligible signed-in customers', async () => {
      const c = await signUp('asha@example.com');
      const user = await prisma.user.findFirstOrThrow();
      await coupon('ASHA', { customerIds: [user.id], type: 'FIXED', value: 50_000 });
      await coupon('FIRST', { firstOrderOnly: true });
      await add(c, f.pods.variants[0]!).expect(201);
      const res = await c.post('/api/cart/coupon', { code: 'ASHA' }).expect(201);
      expect(res.body.data.totals.couponDiscount).toBe(50_000);
      await c.post('/api/cart/coupon', { code: 'FIRST' }).expect(201);
    });
  });

  describe('merging on sign-in', () => {
    it('merges the guest cart into the account cart and drops the guest cart', async () => {
      const member = await signUp('asha@example.com');
      await add(member, f.pods.variants[0]!, 1).expect(201);
      await add(member, f.cable.variants[0]!, 1).expect(201);

      const guest = await browser(app);
      await add(guest, f.pods.variants[0]!, 2).expect(201);
      await add(guest, f.boom.variants[1]!, 1).expect(201);
      const login = await guest
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(200);
      expect(cookieNames(login).sk_cart).toMatch(/Expires=Thu, 01 Jan 1970/);

      const cart = (await guest.get('/api/cart').expect(200)).body.data;
      const qty = Object.fromEntries(
        cart.items.map((i: { name: string; quantity: number }) => [i.name, i.quantity]),
      );
      expect(qty).toEqual({ Pods: 3, Cable: 1, Boom: 1 });
      expect(await prisma.cart.count()).toBe(1);
      // The same account on another device sees the merged cart.
      expect((await member.get('/api/cart/summary')).body.data.count).toBe(5);
    });
  });

  describe('wishlist', () => {
    it('requires sign-in', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/wishlist').expect(401);
      await request(server).get('/api/wishlist/ids').expect(401);
    });

    it('adds (idempotently), lists with live price and stock, and removes', async () => {
      const c = await signUp('asha@example.com');
      await c.post('/api/wishlist', { productId: f.pods.id }).expect(200);
      const ids = await c.post('/api/wishlist', { productId: f.pods.id }).expect(200);
      expect(ids.body.data).toEqual([f.pods.id]);
      await c.post('/api/wishlist', { productId: f.boom.id }).expect(200);
      expect(
        (await c.post('/api/wishlist', { productId: f.draft.id }).expect(404)).body.error.code,
      ).toBe('PRODUCT_UNAVAILABLE');

      await prisma.product.update({ where: { id: f.pods.id }, data: { status: 'ARCHIVED' } });
      const list = (await c.get('/api/wishlist').expect(200)).body.data;
      expect(list).toEqual([
        expect.objectContaining({
          name: 'Boom',
          price: 279_900,
          available: true,
          hasMultipleVariants: true,
        }),
        expect.objectContaining({
          name: 'Pods',
          available: false,
          stock: 'out_of_stock',
          defaultVariantId: null,
        }),
      ]);
      const after = await c.delete(`/api/wishlist/${f.pods.id}`).expect(200);
      expect(after.body.data).toEqual([f.boom.id]);
    });

    it('moves products to the cart, asking for a choice when there are options', async () => {
      const c = await signUp('asha@example.com');
      await c.post('/api/wishlist', { productId: f.cable.id }).expect(200);
      await c.post('/api/wishlist', { productId: f.boom.id }).expect(200);

      const moved = await c.post(`/api/wishlist/${f.cable.id}/move-to-cart`).expect(200);
      expect(moved.body.data.items.map((i: { name: string }) => i.name)).toEqual(['Cable']);

      const choose = await c.post(`/api/wishlist/${f.boom.id}/move-to-cart`).expect(409);
      expect(choose.body.error.code).toBe('VARIANT_REQUIRED');
      await c
        .post(`/api/wishlist/${f.boom.id}/move-to-cart`, { variantId: f.pods.variants[0] })
        .expect(404);
      await c
        .post(`/api/wishlist/${f.boom.id}/move-to-cart`, { variantId: f.boom.variants[1] })
        .expect(200);
      expect((await c.get('/api/wishlist/ids')).body.data).toEqual([]);
      expect((await c.get('/api/cart/summary')).body.data.count).toBe(2);
    });

    it("keeps each customer's wishlist private", async () => {
      const a = await signUp('asha@example.com');
      const b = await signUp('ravi@example.com');
      await a.post('/api/wishlist', { productId: f.pods.id }).expect(200);
      await b.delete(`/api/wishlist/${f.pods.id}`).expect(200);
      expect((await a.get('/api/wishlist/ids')).body.data).toEqual([f.pods.id]);
      expect((await b.get('/api/wishlist/ids')).body.data).toEqual([]);
    });
  });

  it('purges abandoned guest carts but keeps customer carts', async () => {
    const guest = await browser(app);
    await add(guest, f.pods.variants[0]!).expect(201);
    const member = await signUp('asha@example.com');
    await add(member, f.pods.variants[0]!).expect(201);
    await prisma.cart.updateMany({ data: { updatedAt: new Date(Date.now() - 61 * 86_400_000) } });
    expect(await app.get(CartService).purgeStale()).toBe(1);
    expect(await prisma.cart.count({ where: { userId: { not: null } } })).toBe(1);
  });
});
