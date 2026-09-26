import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { MessagingService } from '../src/messaging/messaging.service';
import { createTestApp } from './helpers/app';
import { browser, type BrowserClient } from './helpers/client';
import { truncateAll } from './helpers/db';
import { staffClient } from './helpers/staff';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
let seq = 0;

async function product(slug = 'aurora-buds') {
  const cat = await prisma.category.upsert({
    where: { slug: 'audio' },
    update: {},
    create: { name: 'Audio', slug: 'audio' },
  });
  return prisma.product.create({
    data: {
      name: 'Aurora Buds',
      slug,
      sku: slug.toUpperCase(),
      categoryId: cat.id,
      status: 'ACTIVE',
      variants: {
        create: [
          {
            sku: `${slug.toUpperCase()}-A`,
            name: 'Black',
            mrp: 1000,
            price: 1000,
            inventory: { create: { stock: 5 } },
          },
        ],
      },
    },
  });
}

async function order(opts: {
  userId?: string | null;
  productId?: string | null;
  delivered?: boolean;
  placedAt?: Date;
  total?: number;
  status?: 'CONFIRMED' | 'DELIVERED' | 'CANCELLED';
  payment?: 'COD' | 'PREPAID';
}) {
  const n = ++seq;
  const total = opts.total ?? 100_000;
  return prisma.order.create({
    data: {
      orderNumber: `SK26092601${String(n).padStart(3, '0')}`,
      userId: opts.userId ?? null,
      email: 'a@example.com',
      phone: '9876543210',
      status: opts.status ?? (opts.delivered ? 'DELIVERED' : 'CONFIRMED'),
      paymentMethod: opts.payment ?? 'COD',
      shippingAddress: { name: 'Asha Rao' },
      billingAddress: {},
      mrpTotal: total,
      subtotal: total,
      shippingFee: 4_900,
      taxTotal: 15_254,
      grandTotal: total + 4_900,
      placedAt: opts.placedAt ?? new Date(),
      confirmedAt: new Date(),
      deliveredAt: opts.delivered ? new Date() : null,
      items: {
        create: [
          {
            productId: opts.productId ?? null,
            productName: 'Aurora Buds',
            variantName: 'Black',
            sku: 'AUR-A',
            mrp: total,
            unitPrice: total / 2,
            quantity: 2,
            taxRate: 18,
            taxAmount: 0,
            lineTotal: total,
          },
        ],
      },
    },
  });
}

describe('engagement admin (integration)', () => {
  let app: INestApplication;
  let admin: BrowserClient;
  const pub = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    admin = await staffClient(app, prisma, 'SUPER_ADMIN');
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function customer(email = 'asha@example.com', name = 'Asha Rao') {
    const c = await browser(app);
    await c.post('/api/auth/register', { name, email, password: 'Tulsi-garden-42' }).expect(201);
    return { c, user: await prisma.user.findUniqueOrThrow({ where: { email } }) };
  }

  describe('reviews', () => {
    it('only lets customers who received the product review it; moderation drives the rating', async () => {
      const p = await product();
      const { c, user } = await customer();
      const review = {
        productId: p.id,
        rating: 4,
        title: 'Great sound',
        body: 'Clear audio and the battery lasts all day.',
      };
      expect((await c.post('/api/reviews', review).expect(403)).body.error.code).toBe(
        'NOT_PURCHASED',
      );
      await order({ userId: user.id, productId: p.id, delivered: false });
      await c.post('/api/reviews', review).expect(403); // not delivered yet
      await order({ userId: user.id, productId: p.id, delivered: true });

      const eligibility = (await c.get(`/api/users/me/reviews/eligibility/${p.id}`).expect(200))
        .body.data;
      expect(eligibility).toEqual({ canReview: true, review: null });
      expect(
        (await c.get('/api/users/me/reviews').expect(200)).body.data.awaiting.map(
          (a: { slug: string }) => a.slug,
        ),
      ).toEqual(['aurora-buds']);

      const mine = (await c.post('/api/reviews', review).expect(201)).body.data;
      expect(mine).toMatchObject({ status: 'PENDING', rating: 4 });
      expect(
        (await pub().get('/api/products/aurora-buds/reviews').expect(200)).body.data.reviews,
      ).toEqual([]);

      // Moderation queue and approval.
      const queue = (await admin.get('/api/admin/reviews').expect(200)).body;
      expect(queue.data[0]).toMatchObject({
        id: mine.id,
        isVerifiedPurchase: true,
        customer: { name: 'Asha Rao' },
      });
      await admin.post(`/api/admin/reviews/${mine.id}/moderate`, { action: 'approve' }).expect(204);
      const live = (await pub().get('/api/products/aurora-buds/reviews').expect(200)).body.data;
      expect(live.reviews[0]).toMatchObject({
        author: 'Asha R.',
        rating: 4,
        isVerifiedPurchase: true,
      });
      expect(live.summary).toEqual({ average: 4, count: 1, distribution: [0, 0, 0, 1, 0] });
      expect((await pub().get('/api/products/aurora-buds').expect(200)).body.data).toMatchObject({
        ratingAvg: 4,
        ratingCount: 1,
      });

      // Editing sends it back to moderation and takes it off the product.
      const edited = (await c.post('/api/reviews', { ...review, rating: 2 }).expect(201)).body.data;
      expect(edited).toMatchObject({ id: mine.id, status: 'PENDING', rating: 2 });
      expect((await pub().get('/api/products/aurora-buds').expect(200)).body.data.ratingCount).toBe(
        0,
      );

      expect(
        (
          await admin
            .post(`/api/admin/reviews/${mine.id}/moderate`, { action: 'reject' })
            .expect(422)
        ).body.error.details[0].path,
      ).toBe('note');
      await admin
        .post(`/api/admin/reviews/${mine.id}/moderate`, {
          action: 'reject',
          note: 'Please describe the product',
        })
        .expect(204);
      const after = (await c.get('/api/users/me/reviews').expect(200)).body.data;
      expect(after.reviews[0]).toMatchObject({
        status: 'REJECTED',
        moderationNote: 'Please describe the product',
      });
      expect(after.awaiting).toEqual([]);

      await c.delete(`/api/reviews/${mine.id}`).expect(204);
      expect(await prisma.review.count()).toBe(0);
      expect(await prisma.auditLog.count({ where: { action: { startsWith: 'review.' } } })).toBe(2);
    });

    it('filters and sorts public reviews and validates input', async () => {
      const p = await product();
      for (const [i, rating] of [5, 3, 1].entries()) {
        const { c, user } = await customer(`c${i}@example.com`, `Customer ${i}`);
        await order({ userId: user.id, productId: p.id, delivered: true });
        const r = (
          await c
            .post('/api/reviews', {
              productId: p.id,
              rating,
              body: `Review number ${i} for this product.`,
            })
            .expect(201)
        ).body.data;
        await admin.post(`/api/admin/reviews/${r.id}/moderate`, { action: 'approve' }).expect(204);
      }
      const get = async (qs: string) =>
        (await pub().get(`/api/products/aurora-buds/reviews?${qs}`).expect(200)).body;
      expect(
        (await get('sort=lowest')).data.reviews.map((r: { rating: number }) => r.rating),
      ).toEqual([1, 3, 5]);
      expect((await get('rating=5')).meta.total).toBe(1);
      expect((await get('')).data.summary).toMatchObject({
        average: 3,
        count: 3,
        distribution: [1, 0, 1, 0, 1],
      });
      const { c } = await customer('x@example.com');
      await c.post('/api/reviews', { productId: p.id, rating: 6, body: 'x' }).expect(422);
      await (
        await staffClient(app, prisma, 'INVENTORY_MANAGER')
      )
        .get('/api/admin/reviews')
        .expect(403);
    });
  });

  describe('alerts', () => {
    it('shows each staff member only what they can act on', async () => {
      const p = await product();
      await order({});
      await prisma.review.create({
        data: {
          productId: p.id,
          userId: (await customer()).user.id,
          rating: 5,
          body: 'Lovely product indeed.',
        },
      });
      await prisma.inventory.updateMany({ data: { stock: 0 } });
      const keys = async (c: BrowserClient) =>
        (await c.get('/api/admin/alerts').expect(200)).body.data
          .map((a: { key: string }) => a.key)
          .sort();
      expect(await keys(admin)).toEqual(['out_of_stock', 'reviews', 'to_ship']);
      expect(await keys(await staffClient(app, prisma, 'INVENTORY_MANAGER'))).toEqual([
        'out_of_stock',
        'to_ship',
      ]);
      expect(await keys(await staffClient(app, prisma, 'CUSTOMER_SUPPORT'))).toEqual([
        'reviews',
        'to_ship',
      ]);
    });
  });

  describe('audit log', () => {
    it('filters entries and shows who did what', async () => {
      await admin.post('/api/admin/brands', { name: 'Aurora' }).expect(201);
      await admin
        .post('/api/admin/coupons', { code: 'SAVE5', type: 'PERCENTAGE', value: 5 })
        .expect(201);
      const all = (await admin.get('/api/admin/audit').expect(200)).body;
      expect(all.data.map((e: { action: string }) => e.action)).toEqual([
        'coupon.created',
        'brand.created',
      ]);
      expect(all.data[0].actor).toMatchObject({ name: 'SUPER_ADMIN', role: 'Super admin' });
      expect((await admin.get('/api/admin/audit?action=brand').expect(200)).body.meta.total).toBe(
        1,
      );
      expect(
        (await admin.get('/api/admin/audit?entityType=coupon').expect(200)).body.data[0].metadata,
      ).toMatchObject({ code: 'SAVE5' });
      await (await staffClient(app, prisma, 'MANAGER')).get('/api/admin/audit').expect(403);
    });
  });

  describe('staff', () => {
    it('invites by email (no password sent), promotes customers and protects the last super admin', async () => {
      const messaging = app.get(MessagingService);
      messaging.outbox.length = 0;
      const list = (
        await admin
          .post('/api/admin/staff', {
            name: 'Neha',
            email: 'Neha@SeShaKart.com',
            role: 'CUSTOMER_SUPPORT',
          })
          .expect(201)
      ).body.data;
      const neha = list.find((s: { email: string }) => s.email === 'neha@seshakart.com');
      expect(neha).toMatchObject({
        role: 'CUSTOMER_SUPPORT',
        hasPassword: false,
        status: 'ACTIVE',
      });
      const mail = messaging.outbox.find(
        (m) => m.kind === 'email' && m.to === 'neha@seshakart.com',
      );
      expect(mail && 'subject' in mail && mail.subject).toMatch(/added to the SeShaKart admin/);
      expect(mail && 'text' in mail && mail.text).toContain('/forgot-password');
      expect(
        (
          await admin
            .post('/api/admin/staff', { name: 'Neha', email: 'neha@seshakart.com', role: 'ADMIN' })
            .expect(409)
        ).body.error.code,
      ).toBe('ALREADY_STAFF');

      // Existing customer becomes staff; their open session gets the new access at once.
      const { c, user } = await customer();
      await c.get('/api/admin/orders').expect(403);
      await admin
        .post('/api/admin/staff', { name: 'Asha', email: 'asha@example.com', role: 'MANAGER' })
        .expect(201);
      await c.get('/api/admin/orders').expect(200);

      // Suspending signs them out; removing staff access returns them to customer.
      await admin
        .put(`/api/admin/staff/${user.id}`, { role: 'MANAGER', status: 'SUSPENDED' })
        .expect(200);
      await c.get('/api/users/me').expect(401);
      const removed = (
        await admin
          .put(`/api/admin/staff/${user.id}`, { role: 'CUSTOMER', status: 'ACTIVE' })
          .expect(200)
      ).body.data;
      expect(removed.some((s: { id: string }) => s.id === user.id)).toBe(false);

      const me = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
      expect(
        (
          await admin
            .put(`/api/admin/staff/${me.id}`, { role: 'ADMIN', status: 'ACTIVE' })
            .expect(409)
        ).body.error.code,
      ).toBe('CANNOT_CHANGE_SELF');
      const other = await staffClient(app, prisma, 'SUPER_ADMIN');
      expect(
        (
          await other
            .put(`/api/admin/staff/${me.id}`, { role: 'ADMIN', status: 'ACTIVE' })
            .expect(200)
        ).body.data,
      ).toBeDefined();
      const otherUser = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
      const demoted = await staffClient(app, prisma, 'ADMIN');
      await demoted.get('/api/admin/staff').expect(403); // staff:write is super-admin only
      expect(otherUser.id).not.toBe(me.id);
      expect(await prisma.auditLog.count({ where: { action: { startsWith: 'staff.' } } })).toBe(5);
    });
  });

  describe('sales report', () => {
    it('summarises sales by India-time day and month with refunds on the day they were paid', async () => {
      const p = await product();
      const d1 = new Date('2026-09-01T10:00:00+05:30');
      const d2 = new Date('2026-09-02T23:30:00+05:30'); // still 2 Sept in India
      await order({ productId: p.id, placedAt: d1, total: 100_000 });
      const paid = await order({
        productId: p.id,
        placedAt: d2,
        total: 50_000,
        payment: 'PREPAID',
        status: 'DELIVERED',
      });
      await order({ productId: p.id, placedAt: d2, total: 999_999, status: 'CANCELLED' });
      await order({
        productId: p.id,
        placedAt: new Date('2026-10-05T10:00:00+05:30'),
        total: 20_000,
      });
      const payment = await prisma.payment.create({
        data: { orderId: paid.id, provider: 'razorpay', amount: 54_900, status: 'CAPTURED' },
      });
      await prisma.refund.create({
        data: {
          paymentId: payment.id,
          orderId: paid.id,
          amount: 10_000,
          status: 'PROCESSED',
          processedAt: new Date('2026-09-03T12:00:00+05:30'),
        },
      });

      const r = (
        await admin.get('/api/admin/reports/sales?from=2026-09-01&to=2026-09-03').expect(200)
      ).body.data;
      expect(
        r.rows.map((x: { period: string; orders: number; netSales: number; refunds: number }) => [
          x.period,
          x.orders,
          x.netSales,
          x.refunds,
        ]),
      ).toEqual([
        ['2026-09-01', 1, 104_900, 0],
        ['2026-09-02', 1, 54_900, 0],
        ['2026-09-03', 0, -10_000, 10_000],
      ]);
      expect(r.totals).toMatchObject({
        orders: 2,
        units: 4,
        grossSales: 150_000,
        shipping: 9_800,
        refunds: 10_000,
        netSales: 149_800,
      });
      expect(r.byPayment).toEqual([
        { method: 'COD', orders: 1, netSales: 104_900 },
        { method: 'PREPAID', orders: 1, netSales: 54_900 },
      ]);
      expect(r.byCategory).toEqual([{ category: 'Audio', units: 4, sales: 150_000 }]);

      const monthly = (
        await admin
          .get('/api/admin/reports/sales?from=2026-09-01&to=2026-10-31&groupBy=month')
          .expect(200)
      ).body.data;
      expect(
        monthly.rows.map((x: { period: string; orders: number }) => [x.period, x.orders]),
      ).toEqual([
        ['2026-09', 2],
        ['2026-10', 1],
      ]);
      const csv = await admin
        .get('/api/admin/reports/sales.csv?from=2026-09-01&to=2026-09-03')
        .expect(200);
      expect(
        csv.text
          .replace(/^\uFEFF/, '')
          .split('\r\n')
          .at(-2),
      ).toBe('Total,2,4,1500.00,0.00,98.00,305.08,100.00,1498.00');
      await admin.get('/api/admin/reports/sales?from=2026-09-05&to=2026-09-01').expect(422);
      await (
        await staffClient(app, prisma, 'CUSTOMER_SUPPORT')
      )
        .get('/api/admin/reports/sales?from=2026-09-01&to=2026-09-03')
        .expect(403);
    });
  });
});
