import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { CacheService } from '../src/cache/cache.service';
import { formatOrderNumber } from '../src/checkout/checkout.service';
import { PaymentsService } from '../src/checkout/payments.service';
import { MessagingService } from '../src/messaging/messaging.service';
import { PAYMENT_GATEWAY } from '../src/payments/gateways/gateway';
import type { MockGateway } from '../src/payments/gateways/mock.gateway';
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
const CONTACT = { email: 'asha@example.com', phone: '9876543210' };

/**
 * Store defaults: free delivery from ₹499 (else ₹49), express ₹99, COD fee ₹49,
 * COD up to ₹10,000, stock held 30 minutes for online payments.
 *   pods    ₹1,999 (MRP ₹4,999), stock 5
 *   cable   ₹199, stock 100
 *   battery ₹999, stock 10, not eligible for COD
 */
async function fixture() {
  const audio = await prisma.category.create({ data: { slug: 'audio', name: 'Audio' } });
  let n = 0;
  const product = async (
    slug: string,
    price: number,
    mrp: number,
    stock: number,
    extra: object = {},
  ) => {
    const p = await prisma.product.create({
      data: {
        slug,
        name: slug[0]!.toUpperCase() + slug.slice(1),
        sku: `SKU-${++n}`,
        categoryId: audio.id,
        status: 'ACTIVE',
        publishedAt: new Date(),
        hsnCode: '8518',
        variants: {
          create: [
            {
              sku: `SKU-${n}-0`,
              name: 'Default',
              price: price * 100,
              mrp: mrp * 100,
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
  return {
    pods: await product('pods', 1999, 4999, 5),
    cable: await product('cable', 199, 399, 100),
    battery: await product('battery', 999, 1499, 10, { isCodAvailable: false }),
  };
}

const key = () => randomBytes(16).toString('base64url');

describe('checkout and payments (integration)', () => {
  let app: INestApplication;
  let f: Awaited<ReturnType<typeof fixture>>;
  let gateway: MockGateway;
  let payments: PaymentsService;

  beforeAll(async () => {
    app = await createTestApp();
    gateway = app.get(PAYMENT_GATEWAY);
    payments = app.get(PaymentsService);
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

  async function guestWith(items: [string, number][]): Promise<BrowserClient> {
    const c = await browser(app);
    for (const [variantId, quantity] of items)
      await c.post('/api/cart/items', { variantId, quantity }).expect(201);
    return c;
  }
  async function quote(c: BrowserClient, body: object = {}) {
    return (await c.post('/api/checkout/quote', body).expect(200)).body.data;
  }
  async function place(c: BrowserClient, body: object = {}, status?: number, expected?: number) {
    const q = await quote(c, { paymentMethod: 'COD', ...body });
    const req = c.post('/api/checkout/orders', {
      contact: CONTACT,
      shippingAddress: ADDRESS,
      paymentMethod: 'COD',
      expectedTotal: expected ?? q.totals.total,
      idempotencyKey: key(),
      ...body,
    });
    return status ? req.expect(status) : req;
  }
  const orderOf = (orderNumber: string) =>
    prisma.order.findUniqueOrThrow({
      where: { orderNumber },
      include: { items: true, payments: true, history: true },
    });

  it('formats order numbers as SK + India date + sequence', () => {
    expect(formatOrderNumber(1042n, new Date('2026-09-26T20:00:00Z'))).toBe('SK260927001042');
  });

  describe('quote', () => {
    it('offers delivery and payment options with server-computed totals', async () => {
      const c = await guestWith([[f.cable.variant, 1]]);
      let q = await quote(c);
      expect(q.deliveryOptions).toEqual([
        expect.objectContaining({ method: 'STANDARD', fee: 4_900, available: true }),
        expect.objectContaining({ method: 'EXPRESS', fee: 9_900, available: true }),
      ]);
      expect(q.paymentOptions).toEqual([
        expect.objectContaining({ method: 'PREPAID', fee: 0, available: true }),
        expect.objectContaining({ method: 'COD', fee: 4_900, available: true }),
      ]);
      expect(q.totals).toMatchObject({
        subtotal: 19_900,
        shippingFee: 4_900,
        codFee: 0,
        total: 24_800,
      });
      expect(q.canPlaceOrder).toBe(true);

      q = await quote(c, { deliveryMethod: 'EXPRESS', paymentMethod: 'COD' });
      expect(q.totals).toMatchObject({ shippingFee: 9_900, codFee: 4_900, total: 34_700 });
    });

    it('explains when cash on delivery is not available', async () => {
      const c = await guestWith([[f.battery.variant, 1]]);
      const q = await quote(c, { paymentMethod: 'COD' });
      expect(q.paymentOptions[1]).toMatchObject({
        available: false,
        reason: 'Some items in your cart can’t be paid for on delivery.',
      });
      expect(q.canPlaceOrder).toBe(false);
      const res = await place(c, { paymentMethod: 'COD' }, 422);
      expect(res.body.error.code).toBe('PAYMENT_METHOD_UNAVAILABLE');

      const big = await guestWith([[f.pods.variant, 5]]); // ₹9,995 + ₹49 COD > ₹10,000
      expect((await quote(big, { paymentMethod: 'COD' })).paymentOptions[1].reason).toBe(
        'Cash on delivery is available on orders up to ₹10,000.',
      );
    });
  });

  describe('cash on delivery', () => {
    it('places a confirmed order: stock sold, cart cleared, snapshot and history kept, email sent', async () => {
      const c = await guestWith([[f.pods.variant, 2]]);
      await c.patch(`/api/cart/items/${(await c.get('/api/cart')).body.data.items[0].id}`, {
        quantity: 2,
      });
      const res = await place(c, { paymentMethod: 'COD' }, 201);
      const result = res.body.data;
      expect(result).toMatchObject({
        status: 'CONFIRMED',
        paymentMethod: 'COD',
        total: 399_800 + 4_900,
        payment: null,
      });
      expect(result.orderNumber).toMatch(/^SK\d{12}$/);
      expect(result.guestAccessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      expect(await stockOf(f.pods.variant)).toEqual({ stock: 3, reserved: 0 });
      expect((await prisma.product.findUniqueOrThrow({ where: { id: f.pods.id } })).soldCount).toBe(
        2,
      );
      expect((await c.get('/api/cart')).body.data.items).toEqual([]);

      const order = await orderOf(result.orderNumber);
      expect(order).toMatchObject({
        email: 'asha@example.com',
        subtotal: 399_800,
        codFee: 4_900,
        grandTotal: 404_700,
        taxTotal: Math.round((399_800 * 18) / 118),
      });
      expect(order.items[0]).toMatchObject({
        productName: 'Pods',
        sku: 'SKU-1-0',
        hsnCode: '8518',
        quantity: 2,
        unitPrice: 199_900,
      });
      expect(order.history.map((h) => h.toStatus).sort()).toEqual(['CONFIRMED', 'PENDING']);
      const ledger = await prisma.inventoryTransaction.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(ledger.map((t) => t.type)).toEqual(['RESERVE', 'SALE']);
      const mail = app.get(MessagingService).outbox.find((m) => m.to === 'asha@example.com');
      expect(mail && 'subject' in mail && mail.subject).toBe(
        `Order ${result.orderNumber} confirmed`,
      );
    });

    it('shows guests their order only with the token', async () => {
      const c = await guestWith([[f.cable.variant, 3]]);
      const { orderNumber, guestAccessToken } = (await place(c, {}, 201)).body.data;
      const server = app.getHttpServer();
      const ok = await request(server)
        .get(`/api/checkout/orders/${orderNumber}`)
        .set('X-Order-Token', guestAccessToken)
        .expect(200);
      expect(ok.body.data).toMatchObject({
        orderNumber,
        status: 'CONFIRMED',
        items: [expect.objectContaining({ name: 'Cable' })],
      });
      await request(server).get(`/api/checkout/orders/${orderNumber}`).expect(404);
      await request(server)
        .get(`/api/checkout/orders/${orderNumber}`)
        .set('X-Order-Token', 'x'.repeat(43))
        .expect(404);
    });
  });

  describe('safety checks', () => {
    it('requires contact details from guests and rejects stale totals', async () => {
      const c = await guestWith([[f.cable.variant, 1]]);
      const q = await quote(c, { paymentMethod: 'COD' });
      const noContact = await c
        .post('/api/checkout/orders', {
          shippingAddress: ADDRESS,
          paymentMethod: 'COD',
          expectedTotal: q.totals.total,
          idempotencyKey: key(),
        })
        .expect(422);
      expect(noContact.body.error.code).toBe('CONTACT_REQUIRED');

      const stale = await place(c, {}, 409, q.totals.total - 100);
      expect(stale.body.error.code).toBe('PRICE_CHANGED');
      expect(await prisma.order.count()).toBe(0);

      await c
        .post('/api/checkout/orders', {
          paymentMethod: 'COD',
          expectedTotal: 1,
          idempotencyKey: key(),
        })
        .expect(422);
      const empty = await browser(app);
      expect((await place(empty, {}, 409)).body.error.code).toBe('CART_EMPTY');
    });

    it('is idempotent: retrying with the same key returns the same order', async () => {
      const c = await guestWith([[f.cable.variant, 1]]);
      const q = await quote(c, { paymentMethod: 'COD' });
      const body = {
        contact: CONTACT,
        shippingAddress: ADDRESS,
        paymentMethod: 'COD',
        expectedTotal: q.totals.total,
        idempotencyKey: key(),
      };
      const first = (await c.post('/api/checkout/orders', body).expect(201)).body.data;
      const again = (await c.post('/api/checkout/orders', body).expect(201)).body.data;
      expect(again).toEqual(first);
      expect(await prisma.order.count()).toBe(1);
      const stranger = await guestWith([[f.cable.variant, 1]]);
      expect((await stranger.post('/api/checkout/orders', body).expect(409)).body.error.code).toBe(
        'IDEMPOTENCY_CONFLICT',
      );
    });

    it('never oversells when two shoppers race for the last units', async () => {
      await prisma.inventory.update({ where: { variantId: f.pods.variant }, data: { stock: 1 } });
      const a = await guestWith([[f.pods.variant, 1]]);
      const b = await guestWith([[f.pods.variant, 1]]);
      const [ra, rb] = await Promise.all([place(a), place(b)]);
      expect([ra.status, rb.status].sort()).toEqual([201, 409]);
      // Depending on timing the loser either hits the reservation (INSUFFICIENT_STOCK)
      // or already sees its line as sold out when the cart is read (CART_NEEDS_ATTENTION).
      const loser = ra.status === 409 ? ra : rb;
      expect(['INSUFFICIENT_STOCK', 'CART_NEEDS_ATTENTION']).toContain(loser.body.error.code);
      expect(await prisma.order.count()).toBe(1);
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 0, reserved: 0 });
    });

    it('claims a limited coupon only once, even under concurrency', async () => {
      await prisma.coupon.create({
        data: { code: 'ONCE', type: 'FIXED', value: 5_000, usageLimit: 1 },
      });
      const a = await guestWith([[f.pods.variant, 1]]);
      const b = await guestWith([[f.pods.variant, 1]]);
      await a.post('/api/cart/coupon', { code: 'ONCE' }).expect(201);
      await b.post('/api/cart/coupon', { code: 'ONCE' }).expect(201);
      const [ra, rb] = await Promise.all([
        place(a, { contact: { email: 'a@example.com', phone: '9876543210' } }),
        place(b, { contact: { email: 'b@example.com', phone: '9876543211' } }),
      ]);
      expect([ra.status, rb.status].sort()).toEqual([201, 409]);
      expect((ra.status === 409 ? ra : rb).body.error.code).toBe('COUPON_INVALID');
      expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'ONCE' } })).usedCount).toBe(
        1,
      );
      // The losing order left no reservation behind.
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 4, reserved: 0 });
    });

    it('limits coupons per customer by email for guests', async () => {
      await prisma.coupon.create({ data: { code: 'HELLO', type: 'FIXED', value: 1_000 } });
      for (const expected of [201, 409]) {
        const c = await guestWith([[f.pods.variant, 1]]);
        await c.post('/api/cart/coupon', { code: 'HELLO' }).expect(201);
        await place(c, {}, expected);
      }
    });
  });

  describe('signed-in customers', () => {
    it('uses saved addresses (their own only), can save new ones, and defaults contact details', async () => {
      const c = await browser(app);
      await c
        .post('/api/auth/register', {
          name: 'Asha Rao',
          email: 'asha@example.com',
          password: PASSWORD,
        })
        .expect(201);
      const other = await browser(app);
      await other
        .post('/api/auth/register', { name: 'Ravi', email: 'ravi@example.com', password: PASSWORD })
        .expect(201);
      const theirs = (await other.post('/api/users/me/addresses', ADDRESS).expect(201)).body.data;
      const mine = (await c.post('/api/users/me/addresses', ADDRESS).expect(201)).body.data;

      await c.post('/api/cart/items', { variantId: f.cable.variant, quantity: 1 }).expect(201);
      const total = (await quote(c, { paymentMethod: 'COD' })).totals.total;
      const base = {
        paymentMethod: 'COD',
        expectedTotal: total,
        contact: { email: 'asha@example.com', phone: '9876543210' },
      };
      await c
        .post('/api/checkout/orders', {
          ...base,
          shippingAddressId: theirs.id,
          idempotencyKey: key(),
        })
        .expect(404);
      const ok = await c
        .post('/api/checkout/orders', {
          ...base,
          shippingAddressId: mine.id,
          idempotencyKey: key(),
        })
        .expect(201);
      expect(ok.body.data.guestAccessToken).toBeNull();
      await request(app.getHttpServer())
        .get(`/api/checkout/orders/${ok.body.data.orderNumber}`)
        .expect(404);
      await c.get(`/api/checkout/orders/${ok.body.data.orderNumber}`).expect(200);

      await c.post('/api/cart/items', { variantId: f.cable.variant, quantity: 1 }).expect(201);
      await c
        .post('/api/checkout/orders', {
          paymentMethod: 'COD',
          expectedTotal: (await quote(c, { paymentMethod: 'COD' })).totals.total,
          shippingAddress: { ...ADDRESS, line1: '99, Park Street' },
          saveAddress: true,
          idempotencyKey: key(),
        })
        .expect(201);
      const book = (await c.get('/api/users/me/addresses')).body.data;
      expect(book.map((a: { line1: string }) => a.line1).sort()).toEqual([
        '12, MG Road',
        '99, Park Street',
      ]);
    });
  });

  describe('online payments', () => {
    async function prepaid(items: [string, number][] = [[f.pods.variant, 2]], body: object = {}) {
      const c = await guestWith(items);
      const res = await place(c, { paymentMethod: 'PREPAID', ...body }, 201);
      c.agent.set('X-Order-Token', res.body.data.guestAccessToken);
      return { c, result: res.body.data };
    }

    it('holds stock while payment is pending, then confirms from the signed webhook', async () => {
      const { c, result } = await prepaid();
      expect(result).toMatchObject({
        status: 'PAYMENT_PENDING',
        paymentMethod: 'PREPAID',
        total: 399_800,
      });
      expect(result.payment).toMatchObject({
        provider: 'mock',
        keyId: null,
        amount: 399_800,
        currency: 'INR',
        orderNumber: result.orderNumber,
        prefill: { name: 'Asha Rao', email: 'asha@example.com', contact: '9876543210' },
      });
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 5, reserved: 2 });

      const done = (
        await c
          .post('/api/payments/mock/complete', {
            orderNumber: result.orderNumber,
            outcome: 'success',
          })
          .expect(200)
      ).body.data;
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 3, reserved: 0 });
      let order = await orderOf(result.orderNumber);
      expect(order.status).toBe('CONFIRMED');
      expect(order.payments[0]).toMatchObject({
        status: 'CAPTURED',
        providerPaymentId: done.providerPaymentId,
      });
      expect(await prisma.webhookEvent.count({ where: { processedAt: { not: null } } })).toBe(1);

      // The browser's own confirmation arrives afterwards: idempotent.
      const verified = await c
        .post('/api/payments/verify', { orderNumber: result.orderNumber, ...done })
        .expect(200);
      expect(verified.body.data).toMatchObject({
        status: 'CONFIRMED',
        paymentStatus: 'CAPTURED',
        canRetryPayment: false,
      });
      order = await orderOf(result.orderNumber);
      expect(order.history.filter((h) => h.toStatus === 'CONFIRMED')).toHaveLength(1);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: f.pods.id } })).soldCount).toBe(
        2,
      );
    });

    it('confirms from the browser callback alone, and rejects forged signatures', async () => {
      const { c, result } = await prepaid();
      const providerOrderId = result.payment.providerOrderId;
      const paid = gateway.simulatePayment(providerOrderId, 'success', result.total);
      const forged = await c
        .post('/api/payments/verify', {
          orderNumber: result.orderNumber,
          providerOrderId,
          providerPaymentId: paid.providerPaymentId,
          signature: 'f'.repeat(64),
        })
        .expect(400);
      expect(forged.body.error.code).toBe('PAYMENT_VERIFICATION_FAILED');
      expect((await orderOf(result.orderNumber)).status).toBe('PAYMENT_PENDING');
      await c
        .post('/api/payments/verify', {
          orderNumber: result.orderNumber,
          providerOrderId,
          providerPaymentId: paid.providerPaymentId,
          signature: gateway.signPayment(providerOrderId, paid.providerPaymentId),
        })
        .expect(200);
      expect((await orderOf(result.orderNumber)).status).toBe('CONFIRMED');
    });

    it('verifies webhook signatures, de-duplicates events and never confirms a wrong amount', async () => {
      const { result } = await prepaid();
      const server = app.getHttpServer();
      const wrong = gateway.simulatePayment(result.payment.providerOrderId, 'success', 100);
      const body = gateway.webhookBody(wrong);
      const post = (b: string, sig: string, id?: string) => {
        const r = request(server)
          .post('/api/webhooks/payments/mock')
          .set('Content-Type', 'application/json')
          .set('X-Webhook-Signature', sig);
        if (id) r.set('X-Webhook-Event-Id', id);
        return r.send(b);
      };
      expect((await post(body, 'bad').expect(401)).body.error.code).toBe(
        'WEBHOOK_SIGNATURE_INVALID',
      );
      await request(server).post('/api/webhooks/payments/razorpay').send(body).expect(404);
      expect(await prisma.webhookEvent.count()).toBe(0);

      await post(body, gateway.signWebhook(body), 'evt_1').expect(200);
      let order = await orderOf(result.orderNumber);
      expect(order.status).toBe('PAYMENT_PENDING');
      expect(order.payments[0]).toMatchObject({ status: 'CREATED', errorCode: 'AMOUNT_MISMATCH' });

      const right = gateway.simulatePayment(
        result.payment.providerOrderId,
        'success',
        result.total,
      );
      const good = gateway.webhookBody(right);
      expect(
        (await post(good, gateway.signWebhook(good), 'evt_2').expect(200)).body.data.status,
      ).toBe('processed');
      expect(
        (await post(good, gateway.signWebhook(good), 'evt_2').expect(200)).body.data.status,
      ).toBe('duplicate');
      order = await orderOf(result.orderNumber);
      expect(order.status).toBe('CONFIRMED');
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 3, reserved: 0 });
    });

    it('lets the shopper retry after a failed payment', async () => {
      const { c, result } = await prepaid();
      await c
        .post('/api/payments/mock/complete', {
          orderNumber: result.orderNumber,
          outcome: 'failure',
        })
        .expect(200);
      const failed = await c
        .post('/api/payments/failed', {
          orderNumber: result.orderNumber,
          code: 'BAD_REQUEST_ERROR',
        })
        .expect(200);
      expect(failed.body.data).toMatchObject({
        status: 'PAYMENT_PENDING',
        paymentStatus: 'FAILED',
        canRetryPayment: true,
      });

      const retry = (
        await c.post('/api/payments/retry', { orderNumber: result.orderNumber }).expect(200)
      ).body.data;
      expect(retry.payment.providerOrderId).not.toBe(result.payment.providerOrderId);
      await c
        .post('/api/payments/mock/complete', {
          orderNumber: result.orderNumber,
          outcome: 'success',
        })
        .expect(200);
      expect((await orderOf(result.orderNumber)).status).toBe('CONFIRMED');
    });

    it('cancels unpaid orders after the hold expires, releasing stock and the coupon', async () => {
      await prisma.coupon.create({
        data: { code: 'TEN', type: 'PERCENTAGE', value: 10, usageLimit: 5 },
      });
      const c = await guestWith([[f.pods.variant, 2]]);
      await c.post('/api/cart/coupon', { code: 'TEN' }).expect(201);
      const res = await place(c, { paymentMethod: 'PREPAID' }, 201);
      const { orderNumber, guestAccessToken } = res.body.data;
      expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'TEN' } })).usedCount).toBe(1);

      await prisma.order.update({
        where: { orderNumber },
        data: { reservationExpiresAt: new Date(Date.now() - 1000) },
      });
      expect(await payments.sweep()).toEqual({ confirmed: 0, cancelled: 1 });
      const order = await orderOf(orderNumber);
      expect(order).toMatchObject({
        status: 'CANCELLED',
        cancelReason: 'Payment was not completed in time',
      });
      expect(order.payments[0]!.status).toBe('FAILED');
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 5, reserved: 0 });
      expect((await prisma.coupon.findUniqueOrThrow({ where: { code: 'TEN' } })).usedCount).toBe(0);
      expect(await prisma.couponUsage.count()).toBe(0);

      c.agent.set('X-Order-Token', guestAccessToken);
      expect(
        (await c.post('/api/payments/retry', { orderNumber }).expect(409)).body.error.code,
      ).toBe('PAYMENT_NOT_RETRYABLE');
    });

    it('reconciles with the gateway before cancelling (lost webhook)', async () => {
      const { result } = await prepaid();
      gateway.simulatePayment(result.payment.providerOrderId, 'success', result.total); // no webhook
      await prisma.order.update({
        where: { orderNumber: result.orderNumber },
        data: { reservationExpiresAt: new Date(Date.now() - 1000) },
      });
      expect(await payments.sweep()).toEqual({ confirmed: 1, cancelled: 0 });
      expect((await orderOf(result.orderNumber)).status).toBe('CONFIRMED');
    });

    it('refunds automatically when money arrives after the order was cancelled', async () => {
      const { result } = await prepaid();
      await prisma.order.update({
        where: { orderNumber: result.orderNumber },
        data: { reservationExpiresAt: new Date(Date.now() - 1000) },
      });
      await payments.sweep();
      const late = gateway.simulatePayment(result.payment.providerOrderId, 'success', result.total);
      const body = gateway.webhookBody(late);
      await request(app.getHttpServer())
        .post('/api/webhooks/payments/mock')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', gateway.signWebhook(body))
        .send(body)
        .expect(200);
      const order = await orderOf(result.orderNumber);
      expect(order.status).toBe('REFUNDED');
      expect(order.payments[0]!.status).toBe('REFUNDED');
      expect(await prisma.refund.findFirstOrThrow()).toMatchObject({
        amount: result.total,
        status: 'PROCESSED',
      });
      // The stock released at cancellation is not sold again.
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 5, reserved: 0 });
    });

    it('supports partial and full refunds of a captured payment', async () => {
      const { c, result } = await prepaid();
      await c
        .post('/api/payments/mock/complete', {
          orderNumber: result.orderNumber,
          outcome: 'success',
        })
        .expect(200);
      const order = await orderOf(result.orderNumber);
      await payments.refund(order.id, { amount: 100_000, reason: 'Partial return' });
      let now = await orderOf(result.orderNumber);
      expect(now.status).toBe('REFUND_INITIATED');
      expect(now.payments[0]!.status).toBe('PARTIALLY_REFUNDED');
      await expect(
        payments.refund(order.id, { amount: 1_000_000, reason: 'Too much' }),
      ).rejects.toMatchObject({ code: 'REFUND_TOO_LARGE' });
      await payments.refund(order.id, { reason: 'Rest' });
      now = await orderOf(result.orderNumber);
      expect(now.status).toBe('REFUNDED');
      expect(now.payments[0]!.status).toBe('REFUNDED');
      expect((await prisma.refund.findMany()).map((r) => r.amount).sort((a, b) => a - b)).toEqual([
        100_000, 299_800,
      ]);
    });

    it('keeps the cart when the gateway is down, so nothing is lost', async () => {
      const c = await guestWith([[f.pods.variant, 1]]);
      gateway.failNextCreate = true;
      const res = await place(c, { paymentMethod: 'PREPAID' }, 502);
      expect(res.body.error.code).toBe('PAYMENT_UNAVAILABLE');
      expect(await prisma.order.count()).toBe(0);
      expect((await c.get('/api/cart')).body.data.items).toHaveLength(1);
      expect(await stockOf(f.pods.variant)).toEqual({ stock: 5, reserved: 0 });
    });
  });
});
