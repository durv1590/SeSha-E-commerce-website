import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type Role } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { CacheService } from '../src/cache/cache.service';
import { hashPassword } from '../src/common/security/password';
import { MessagingService } from '../src/messaging/messaging.service';
import { createTestApp } from './helpers/app';
import { browser, type BrowserClient } from './helpers/client';
import { truncateAll } from './helpers/db';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const PASSWORD = 'Tulsi-garden-42';
const ADDRESS = {
  name: 'Asha Rao',
  phone: '9876543210',
  line1: '12, MG Road',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
};

/**
 * pods  ₹1,999, stock 10, returnable within 7 days, GST 18%
 * cable ₹199,   stock 50, not returnable
 * Seller registered in Maharashtra (so Pune deliveries are intra-state).
 */
async function fixture() {
  const cat = await prisma.category.create({ data: { slug: 'audio', name: 'Audio' } });
  let n = 0;
  const product = async (slug: string, price: number, stock: number, extra: object = {}) => {
    const p = await prisma.product.create({
      data: {
        slug,
        name: slug[0]!.toUpperCase() + slug.slice(1),
        sku: `SKU-${++n}`,
        categoryId: cat.id,
        status: 'ACTIVE',
        publishedAt: new Date(),
        hsnCode: '8518',
        variants: {
          create: [
            {
              sku: `SKU-${n}-0`,
              name: 'Default',
              price: price * 100,
              mrp: price * 200,
              isDefault: true,
              inventory: { create: { stock } },
            },
          ],
        },
        ...extra,
      },
      include: { variants: true },
    });
    return { id: p.id, variant: p.variants[0]!.id };
  };
  await prisma.setting.create({
    data: {
      key: 'store',
      value: {
        registeredState: 'Maharashtra',
        gstin: '27AAAAA0000A1Z5',
        registeredAddress: '1, Test Street, Pune',
      },
    },
  });
  return {
    pods: await product('pods', 1999, 10),
    cable: await product('cable', 199, 50, { isReturnable: false }),
  };
}

describe('orders, shipping and returns (integration)', () => {
  let app: INestApplication;
  let f: Awaited<ReturnType<typeof fixture>>;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    await app.get(CacheService).delByPrefix('catalog:');
    await app.get(CacheService).delByPrefix('settings:');
    app.get(MessagingService).outbox.length = 0;
    f = await fixture();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const stockOf = (variantId: string) =>
    prisma.inventory.findUniqueOrThrow({
      where: { variantId },
      select: { stock: true, reserved: true },
    });
  const orderOf = (orderNumber: string) =>
    prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { payments: true, refunds: true },
    });
  const subjects = (to: string) =>
    app
      .get(MessagingService)
      .outbox.filter((m) => m.to === to && 'subject' in m)
      .map((m) => (m as { subject: string }).subject);

  async function customer(email = 'asha@example.com'): Promise<BrowserClient> {
    const c = await browser(app);
    await c.post('/api/auth/register', { name: 'Asha Rao', email, password: PASSWORD }).expect(201);
    return c;
  }
  async function staff(role: Role = 'ADMIN'): Promise<BrowserClient> {
    const email = `${role.toLowerCase()}@seshakart.com`;
    await prisma.user.create({
      data: { name: role, email, role, passwordHash: await hashPassword(PASSWORD) },
    });
    const c = await browser(app);
    await c.post('/api/auth/login', { identifier: email, password: PASSWORD }).expect(200);
    return c;
  }
  async function order(
    c: BrowserClient,
    items: [string, number][] = [[f.pods.variant, 2]],
    body: Record<string, unknown> = {},
  ): Promise<string> {
    for (const [variantId, quantity] of items)
      await c.post('/api/cart/items', { variantId, quantity }).expect(201);
    const paymentMethod = (body.paymentMethod as string) ?? 'COD';
    const q = (await c.post('/api/checkout/quote', { paymentMethod }).expect(200)).body.data;
    const res = await c
      .post('/api/checkout/orders', {
        contact: { email: 'asha@example.com', phone: '9876543210' },
        shippingAddress: ADDRESS,
        paymentMethod,
        expectedTotal: q.totals.total,
        idempotencyKey: randomBytes(16).toString('base64url'),
        ...body,
      })
      .expect(201);
    if (res.body.data.guestAccessToken)
      c.agent.set('X-Order-Token', res.body.data.guestAccessToken);
    if (paymentMethod === 'PREPAID')
      await c
        .post('/api/payments/mock/complete', {
          orderNumber: res.body.data.orderNumber,
          outcome: 'success',
        })
        .expect(200);
    return res.body.data.orderNumber;
  }
  const ship = (s: BrowserClient, n: string) =>
    s.post(`/api/admin/orders/${n}/shipments`, {
      carrier: 'delhivery',
      trackingNumber: 'DLV123456',
      estimatedDelivery: '2030-01-05',
    });
  const event = (s: BrowserClient, n: string, status: string, extra: object = {}) =>
    s.post(`/api/admin/orders/${n}/shipments/events`, { status, ...extra });
  async function delivered(c: BrowserClient, s: BrowserClient, items?: [string, number][]) {
    const n = await order(c, items);
    await ship(s, n).expect(201);
    await event(s, n, 'DELIVERED', { location: 'Pune' }).expect(201);
    return n;
  }

  describe('customer views', () => {
    it('lists only the customer’s own orders, with filters and pagination', async () => {
      const c = await customer();
      const n1 = await order(c);
      const n2 = await order(c, [[f.cable.variant, 1]]);
      await c.post(`/api/orders/${n1}/cancel`, { reason: 'CHANGED_MIND' }).expect(200);
      const all = await c.get('/api/orders').expect(200);
      expect(all.body.data.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([n2, n1]);
      expect(all.body.data[0]).toMatchObject({
        status: 'CONFIRMED',
        statusLabel: 'Confirmed',
        itemCount: 1,
        firstItemName: 'Cable',
      });
      expect(all.body.data[0].deliveryNote).toMatch(/^Arriving by /);
      expect(all.body.meta).toMatchObject({ total: 2, page: 1 });
      expect((await c.get('/api/orders?filter=cancelled')).body.data).toHaveLength(1);
      expect(
        (await c.get('/api/orders?filter=active')).body.data.map(
          (o: { orderNumber: string }) => o.orderNumber,
        ),
      ).toEqual([n2]);

      const other = await customer('ravi@example.com');
      expect((await other.get('/api/orders')).body.data).toEqual([]);
      await other.get(`/api/orders/${n1}`).expect(404);
      await request(app.getHttpServer()).get('/api/orders').expect(401);
    });

    it('shows a detailed order with timeline, estimate and allowed actions', async () => {
      const c = await customer();
      const n = await order(c);
      const d = (await c.get(`/api/orders/${n}`).expect(200)).body.data;
      expect(d).toMatchObject({
        status: 'CONFIRMED',
        canCancel: true,
        canRequestReturn: false,
        invoice: null,
        returnDeadline: null,
      });
      expect(d.timeline.map((s: { key: string; done: boolean }) => [s.key, s.done])).toEqual([
        ['PLACED', true],
        ['CONFIRMED', true],
        ['SHIPPED', false],
        ['OUT_FOR_DELIVERY', false],
        ['DELIVERED', false],
      ]);
      expect(d.estimatedDelivery.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.items[0]).toMatchObject({ name: 'Pods', quantity: 2, returnableQuantity: 0 });
    });
  });

  describe('cancellation', () => {
    it('cancels a confirmed COD order: stock restocked, coupon given back, email sent', async () => {
      await prisma.coupon.create({
        data: { code: 'TEN', type: 'PERCENTAGE', value: 10, usageLimit: 5 },
      });
      const c = await customer();
      await c.post('/api/cart/items', { variantId: f.pods.variant, quantity: 2 }).expect(201);
      await c.post('/api/cart/coupon', { code: 'TEN' }).expect(201);
      const n = await order(c, []);
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 8, reserved: 0 });

      const res = await c
        .post(`/api/orders/${n}/cancel`, { reason: 'ORDERED_BY_MISTAKE', comments: 'Wrong colour' })
        .expect(200);
      expect(res.body.data).toMatchObject({
        status: 'CANCELLED',
        canCancel: false,
        cancelReason: 'I ordered by mistake: Wrong colour',
      });
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 10, reserved: 0 });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: f.pods.id } })).soldCount).toBe(
        0,
      );
      expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'TEN' } })).usedCount).toBe(0);
      expect(await prisma.inventoryTransaction.count({ where: { type: 'RESTOCK' } })).toBe(1);
      expect(subjects('asha@example.com')).toContain(`Order ${n} cancelled`);
      expect(
        (await c.post(`/api/orders/${n}/cancel`, { reason: 'OTHER' }).expect(409)).body.error.code,
      ).toBe('ORDER_NOT_CANCELLABLE');
    });

    it('refunds a paid online order in full when cancelled', async () => {
      const c = await customer();
      const n = await order(c, [[f.pods.variant, 1]], { paymentMethod: 'PREPAID' });
      await c.post(`/api/orders/${n}/cancel`, { reason: 'BETTER_PRICE' }).expect(200);
      const o = await orderOf(n);
      expect(o.status).toBe('REFUNDED');
      expect(o.payments[0]!.status).toBe('REFUNDED');
      expect(o.refunds).toEqual([
        expect.objectContaining({ amount: 199_900, status: 'PROCESSED' }),
      ]);
      const d = (await c.get(`/api/orders/${n}`)).body.data;
      expect(d.refunds[0]).toMatchObject({ statusLabel: 'Refunded', amount: 199_900 });
      expect(subjects('asha@example.com')).toContain(`Refund processed for order ${n}`);
    });

    it('lets guests cancel an unpaid order with their token, releasing the hold', async () => {
      const guest = await browser(app);
      await guest.post('/api/cart/items', { variantId: f.pods.variant, quantity: 3 }).expect(201);
      const q = (await guest.post('/api/checkout/quote', {}).expect(200)).body.data;
      const placed = await guest
        .post('/api/checkout/orders', {
          contact: { email: 'g@example.com', phone: '9876543210' },
          shippingAddress: ADDRESS,
          paymentMethod: 'PREPAID',
          expectedTotal: q.totals.total,
          idempotencyKey: randomBytes(16).toString('base64url'),
        })
        .expect(201);
      const { orderNumber, guestAccessToken } = placed.body.data;
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 10, reserved: 3 });
      await guest.post(`/api/orders/${orderNumber}/cancel`, { reason: 'CHANGED_MIND' }).expect(404);
      guest.agent.set('X-Order-Token', guestAccessToken);
      await guest.post(`/api/orders/${orderNumber}/cancel`, { reason: 'CHANGED_MIND' }).expect(200);
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 10, reserved: 0 });
    });
  });

  describe('fulfilment (staff)', () => {
    it('is permission-gated', async () => {
      const c = await customer();
      const n = await order(c);
      await c.post(`/api/admin/orders/${n}/status`, { status: 'PROCESSING' }).expect(403);
      await request(app.getHttpServer()).get(`/api/admin/orders/${n}`).expect(401);
      const inventory = await staff('INVENTORY_MANAGER');
      await inventory.get(`/api/admin/orders/${n}`).expect(200);
      await inventory.post(`/api/admin/orders/${n}/status`, { status: 'PROCESSING' }).expect(403);
      const support = await staff('CUSTOMER_SUPPORT');
      await support.post(`/api/admin/orders/${n}/status`, { status: 'PROCESSING' }).expect(200);
      await support
        .post(`/api/admin/orders/${n}/refunds`, { reason: 'Goodwill', amount: 100 })
        .expect(403);
    });

    it('ships, tracks and delivers an order; issues the invoice; records cash collected; audits every step', async () => {
      const c = await customer();
      const s = await staff();
      const n = await order(c);
      await s.post(`/api/admin/orders/${n}/status`, { status: 'PROCESSING' }).expect(200);
      await s
        .post(`/api/admin/orders/${n}/status`, { status: 'PACKED', note: 'Box 2' })
        .expect(200);
      expect(
        (await c.post(`/api/orders/${n}/cancel`, { reason: 'OTHER' }).expect(409)).body.error
          .message,
      ).toContain('packed or shipped');

      const shipped = (await ship(s, n).expect(201)).body.data;
      expect(shipped).toMatchObject({
        status: 'SHIPPED',
        estimatedDelivery: { from: '2030-01-05', to: '2030-01-05' },
      });
      expect(shipped.invoice.number).toMatch(/^SK\/\d{2}-\d{2}\/\d{6}$/);
      expect(shipped.shipments[0]).toMatchObject({
        carrierName: 'Delhivery',
        trackingNumber: 'DLV123456',
        trackingUrl: null,
      });
      await ship(s, n).expect(409); // already shipped
      const n2 = await order(c, [[f.cable.variant, 1]]);
      const reused = await ship(s, n2).expect(409);
      expect(reused.body.error).toMatchObject({
        code: 'TRACKING_NUMBER_IN_USE',
        message: `This tracking number is already used for order ${n}.`,
      });
      expect(
        (await s.post(`/api/admin/orders/${n}/status`, { status: 'PACKED' }).expect(409)).body.error
          .code,
      ).toBe('INVALID_STATUS_CHANGE');

      const ofd = (await event(s, n, 'OUT_FOR_DELIVERY', { location: 'Pune hub' }).expect(201)).body
        .data;
      const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
      expect(ofd.estimatedDelivery).toEqual({ from: today, to: today });
      await event(s, n, 'FAILED', { note: 'Customer unavailable' }).expect(201);
      expect((await orderOf(n)).status).toBe('SHIPPED');
      await event(s, n, 'OUT_FOR_DELIVERY').expect(201);
      const done = (await event(s, n, 'DELIVERED', { location: 'Pune' }).expect(201)).body.data;
      expect(done.status).toBe('DELIVERED');
      expect(done.timeline.every((step: { done: boolean }) => step.done)).toBe(true);
      expect(done.shipments[0].events.map((e: { status: string }) => e.status)).toEqual([
        'DELIVERED',
        'OUT_FOR_DELIVERY',
        'FAILED',
        'OUT_FOR_DELIVERY',
        'PICKED_UP',
      ]);
      expect((await orderOf(n)).payments).toEqual([
        expect.objectContaining({ provider: 'cod', status: 'CAPTURED', amount: 404_700 }),
      ]);
      expect(subjects('asha@example.com')).toEqual(
        expect.arrayContaining([
          `Your order ${n} has shipped`,
          `Your order ${n} is out for delivery`,
          `Your order ${n} was delivered`,
        ]),
      );
      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'order' },
        orderBy: { createdAt: 'asc' },
      });
      expect(audit.map((a) => a.action)).toEqual([
        'order.status_changed',
        'order.status_changed',
        'order.shipped',
        'order.tracking_updated',
        'order.tracking_updated',
        'order.tracking_updated',
        'order.tracking_updated',
      ]);
    });

    it('serves the invoice as a PDF once shipped, only to the order’s owner', async () => {
      const c = await customer();
      const s = await staff();
      const n = await order(c);
      expect((await c.get(`/api/orders/${n}/invoice`).expect(404)).body.error.code).toBe(
        'INVOICE_NOT_READY',
      );
      await ship(s, n).expect(201);
      const res = await c
        .get(`/api/orders/${n}/invoice`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (d: Buffer) => chunks.push(d));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename="SeShaKart-invoice-SK-\d{2}-\d{2}-\d{6}\.pdf"$/,
      );
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(20_000); // embedded fonts and logo
      const other = await customer('ravi@example.com');
      await other.get(`/api/orders/${n}/invoice`).expect(404);
    });

    it('handles parcels returned to seller: restock and refund when prepaid', async () => {
      const c = await customer();
      const s = await staff();
      const n = await order(c, [[f.pods.variant, 1]], { paymentMethod: 'PREPAID' });
      await ship(s, n).expect(201);
      await event(s, n, 'RETURNED', { note: 'Address not found' }).expect(201);
      const o = await orderOf(n);
      expect(o.status).toBe('REFUNDED');
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 10, reserved: 0 });
    });
  });

  describe('returns and replacements', () => {
    it('refunds a completed return (manual refund for COD), with restock', async () => {
      const c = await customer();
      const s = await staff();
      const n = await delivered(c, s, [
        [f.pods.variant, 2],
        [f.cable.variant, 1],
      ]);
      const d = (await c.get(`/api/orders/${n}`)).body.data;
      const pods = d.items.find((i: { name: string }) => i.name === 'Pods');
      const cable = d.items.find((i: { name: string }) => i.name === 'Cable');
      expect([pods.returnableQuantity, cable.returnableQuantity]).toEqual([2, 0]);
      expect(d).toMatchObject({ canRequestReturn: true });
      expect(d.returnDeadline).toBeTruthy();

      expect(
        (
          await c
            .post(`/api/orders/${n}/returns`, {
              type: 'RETURN',
              reason: 'DAMAGED',
              items: [{ orderItemId: cable.id, quantity: 1 }],
            })
            .expect(409)
        ).body.error.code,
      ).toBe('NOT_RETURNABLE');
      await c
        .post(`/api/orders/${n}/returns`, {
          type: 'RETURN',
          reason: 'DAMAGED',
          items: [{ orderItemId: pods.id, quantity: 3 }],
        })
        .expect(409);
      const req = (
        await c
          .post(`/api/orders/${n}/returns`, {
            type: 'RETURN',
            reason: 'DAMAGED',
            comments: 'Cracked case',
            items: [{ orderItemId: pods.id, quantity: 1 }],
          })
          .expect(201)
      ).body.data;
      expect(req).toMatchObject({ status: 'RETURN_REQUESTED', canCancel: false });
      expect(req.returns[0]).toMatchObject({
        type: 'RETURN',
        status: 'REQUESTED',
        reason: 'Item arrived damaged',
        items: [expect.objectContaining({ name: 'Pods', quantity: 1 })],
      });
      expect(req.items.find((i: { name: string }) => i.name === 'Pods').returnableQuantity).toBe(1);

      const id = req.returns[0].id;
      await s.post(`/api/admin/returns/${id}`, { action: 'receive' }).expect(409); // must be approved first
      await s.post(`/api/admin/returns/${id}`, { action: 'approve' }).expect(200);
      await s.post(`/api/admin/returns/${id}`, { action: 'receive' }).expect(200);
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 9, reserved: 0 });
      const done = (
        await s
          .post(`/api/admin/returns/${id}`, { action: 'complete', note: 'Refund via UPI' })
          .expect(200)
      ).body.data;
      expect(done.status).toBe('REFUND_INITIATED');
      expect(done.refunds).toEqual([
        expect.objectContaining({ amount: 199_900, statusLabel: 'In progress' }),
      ]);

      const refund = await prisma.refund.findFirstOrThrow();
      const support = await staff('CUSTOMER_SUPPORT');
      await support
        .post(`/api/admin/refunds/${refund.id}/complete`, { reference: 'UPI123456' })
        .expect(403);
      await s
        .post(`/api/admin/refunds/${refund.id}/complete`, { reference: 'UPI123456' })
        .expect(200);
      expect((await orderOf(n)).status).toBe('REFUNDED');
      expect(await prisma.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({
        status: 'PROCESSED',
        reference: 'UPI123456',
      });
    });

    it('returns the order to delivered when a request is rejected, and handles replacements without refunds', async () => {
      const c = await customer();
      const s = await staff();
      const n = await delivered(c, s);
      const pods = (await c.get(`/api/orders/${n}`)).body.data.items[0];
      const r1 = (
        await c
          .post(`/api/orders/${n}/returns`, {
            type: 'RETURN',
            reason: 'SIZE_FIT',
            items: [{ orderItemId: pods.id, quantity: 1 }],
          })
          .expect(201)
      ).body.data.returns[0];
      const rejected = (
        await s
          .post(`/api/admin/returns/${r1.id}`, { action: 'reject', note: 'Used item' })
          .expect(200)
      ).body.data;
      expect(rejected.status).toBe('DELIVERED');
      expect(rejected.returns[0]).toMatchObject({
        status: 'REJECTED',
        resolutionNote: 'Used item',
      });

      const r2 = (
        await c
          .post(`/api/orders/${n}/returns`, {
            type: 'REPLACEMENT',
            reason: 'DEFECTIVE',
            items: [{ orderItemId: pods.id, quantity: 2 }],
          })
          .expect(201)
      ).body.data.returns[1];
      for (const action of ['approve', 'receive', 'complete'])
        await s.post(`/api/admin/returns/${r2.id}`, { action, restock: false }).expect(200);
      const final = (await c.get(`/api/orders/${n}`)).body.data;
      expect(final.status).toBe('DELIVERED');
      expect(final.refunds).toEqual([]);
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 8, reserved: 0 });
    });

    it('closes the return window after the product’s return period', async () => {
      const c = await customer();
      const s = await staff();
      const n = await delivered(c, s);
      await prisma.order.update({
        where: { orderNumber: n },
        data: { deliveredAt: new Date(Date.now() - 8 * 86_400_000) },
      });
      const d = (await c.get(`/api/orders/${n}`)).body.data;
      expect(d.canRequestReturn).toBe(false);
      await c
        .post(`/api/orders/${n}/returns`, {
          type: 'RETURN',
          reason: 'DAMAGED',
          items: [{ orderItemId: d.items[0].id, quantity: 1 }],
        })
        .expect(409);
    });
  });

  describe('public tracking', () => {
    it('shows minimal status for the right email or mobile, and nothing otherwise', async () => {
      const c = await customer();
      const s = await staff();
      const n = await order(c);
      await ship(s, n).expect(201);
      const visitor = await browser(app); // the storefront sends the CSRF token
      const ok = await visitor
        .post('/api/orders/track', { orderNumber: n, contact: 'ASHA@example.com' })
        .expect(200);
      expect(ok.body.data).toMatchObject({
        orderNumber: n,
        status: 'SHIPPED',
        deliveryCity: 'Pune',
        itemCount: 2,
      });
      expect(ok.body.data.shipments[0]).toMatchObject({ trackingNumber: 'DLV123456' });
      expect(JSON.stringify(ok.body.data)).not.toMatch(/MG Road|9876543210|grandTotal|asha@/);
      await visitor
        .post('/api/orders/track', { orderNumber: n, contact: '9876543210' })
        .expect(200);
      const wrong = await visitor
        .post('/api/orders/track', { orderNumber: n, contact: 'other@example.com' })
        .expect(404);
      expect(wrong.body.error.message).toContain('couldn’t find an order');
    });
  });

  describe('serviceability', () => {
    it('answers the PIN checker and enforces it at checkout', async () => {
      const server = app.getHttpServer();
      const pune = (
        await request(server).get('/api/shipping/serviceability?pincode=411001').expect(200)
      ).body.data;
      expect(pune).toMatchObject({ serviceable: true, codAvailable: true });
      expect(pune.standard.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(pune.express).not.toBeNull();
      const islands = (
        await request(server).get('/api/shipping/serviceability?pincode=744101').expect(200)
      ).body.data;
      expect(islands).toMatchObject({ serviceable: true, codAvailable: false, express: null });
      await request(server).get('/api/shipping/serviceability?pincode=12').expect(422);

      await prisma.setting.create({
        data: { key: 'shipping', value: { blockedPrefixes: ['7441'] } },
      });
      await app.get(CacheService).delByPrefix('settings:');
      expect(
        (await request(server).get('/api/shipping/serviceability?pincode=744101')).body.data
          .serviceable,
      ).toBe(false);

      const c = await customer();
      await c.post('/api/cart/items', { variantId: f.cable.variant, quantity: 1 }).expect(201);
      const q = (
        await c.post('/api/checkout/quote', { paymentMethod: 'COD', pincode: '744201' }).expect(200)
      ).body.data;
      expect(q.paymentOptions[1]).toMatchObject({
        available: false,
        reason: 'Cash on delivery isn’t available for this PIN code.',
      });
      expect(q.deliveryOptions[1].available).toBe(false);
      const base = {
        contact: { email: 'asha@example.com', phone: '9876543210' },
        paymentMethod: 'PREPAID',
        idempotencyKey: randomBytes(16).toString('base64url'),
      };
      const blocked = await c
        .post('/api/checkout/orders', {
          ...base,
          shippingAddress: { ...ADDRESS, pincode: '744101' },
          expectedTotal: 24_800,
        })
        .expect(422);
      expect(blocked.body.error.code).toBe('NOT_SERVICEABLE');
      const express = await c
        .post('/api/checkout/orders', {
          ...base,
          idempotencyKey: randomBytes(16).toString('base64url'),
          deliveryMethod: 'EXPRESS',
          shippingAddress: { ...ADDRESS, pincode: '744201' },
          expectedTotal: 29_800,
        })
        .expect(422);
      expect(express.body.error.code).toBe('DELIVERY_UNAVAILABLE');
      expect(await prisma.order.count()).toBe(0);
    });
  });
});
