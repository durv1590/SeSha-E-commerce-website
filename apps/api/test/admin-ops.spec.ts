import type { INestApplication } from '@nestjs/common';
import { PrismaClient, type OrderStatus } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { browser, type BrowserClient } from './helpers/client';
import { truncateAll } from './helpers/db';
import { staffClient } from './helpers/staff';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
let seq = 0;

async function order(opts: {
  status?: OrderStatus;
  name?: string;
  email?: string;
  phone?: string;
  total?: number;
  userId?: string | null;
  placedAt?: Date;
  payment?: 'COD' | 'PREPAID';
}) {
  const n = ++seq;
  const total = opts.total ?? 100_000;
  const status = opts.status ?? 'CONFIRMED';
  return prisma.order.create({
    data: {
      orderNumber: `SK26092600${String(n).padStart(3, '0')}`,
      userId: opts.userId ?? null,
      email: opts.email ?? `buyer${n}@example.com`,
      phone: opts.phone ?? `98765${String(n).padStart(5, '0')}`,
      status,
      paymentMethod: opts.payment ?? 'COD',
      shippingAddress: {
        name: opts.name ?? `Buyer ${n}`,
        phone: '9876543210',
        line1: '1 MG Road',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
      },
      billingAddress: {},
      mrpTotal: total,
      subtotal: total,
      grandTotal: total,
      placedAt: opts.placedAt ?? new Date(),
      confirmedAt: ['PENDING', 'PAYMENT_PENDING'].includes(status) ? null : new Date(),
      items: {
        create: [
          {
            productName: `Item ${n}`,
            variantName: '',
            sku: `S${n}`,
            mrp: total,
            unitPrice: total,
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

async function customer(app: INestApplication, email: string, name = 'Asha Rao') {
  const c = await browser(app);
  await c
    .post('/api/auth/register', { name, email, password: 'Tulsi-garden-42', phone: undefined })
    .expect(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { c, user };
}

describe('operations admin (integration)', () => {
  let app: INestApplication;
  let admin: BrowserClient;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    admin = await staffClient(app, prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('orders', () => {
    it('lists queues, searches and filters', async () => {
      await order({ status: 'CONFIRMED', name: 'Meera Iyer', email: 'meera@example.com' });
      await order({ status: 'PACKED', payment: 'PREPAID' });
      await order({ status: 'DELIVERED', phone: '9123456789' });
      const old = await order({
        status: 'CANCELLED',
        placedAt: new Date('2026-01-15T10:00:00+05:30'),
      });
      const pending = await order({ status: 'PAYMENT_PENDING' });

      const get = async (qs: string) =>
        (await admin.get(`/api/admin/orders?${qs}`).expect(200)).body;
      expect((await get('')).meta.total).toBe(5);
      expect(
        (await get('status=to_ship')).data.map((o: { status: string }) => o.status).sort(),
      ).toEqual(['CONFIRMED', 'PACKED']);
      expect((await get('status=PAYMENT_PENDING')).data[0].orderNumber).toBe(pending.orderNumber);
      expect((await get('q=meera')).data[0]).toMatchObject({
        customerName: 'Meera Iyer',
        itemCount: 2,
        city: 'Pune',
      });
      expect((await get('q=MEERA@EXAMPLE')).meta.total).toBe(1);
      expect((await get('q=91234 56789')).meta.total).toBe(1);
      expect((await get(`q=${old.orderNumber.toLowerCase()}`)).meta.total).toBe(1);
      expect((await get('payment=PREPAID')).meta.total).toBe(1);
      expect(
        (await get('from=2026-01-01&to=2026-01-31')).data.map(
          (o: { orderNumber: string }) => o.orderNumber,
        ),
      ).toEqual([old.orderNumber]);
      expect(
        (await admin.get('/api/admin/orders?from=2026-02-01&to=2026-01-01').expect(422)).body.error
          .details[0].path,
      ).toBe('to');
      expect((await get('pageSize=2&page=3')).data).toHaveLength(1);
    });

    it('exports orders as CSV and is limited to staff who can read orders', async () => {
      await order({ name: '=HYPERLINK("x")', total: 129_950 });
      const res = await admin.get('/api/admin/orders/export.csv?status=to_ship').expect(200);
      expect(res.headers['content-disposition']).toMatch(/seshakart-orders-/);
      const lines = res.text
        .replace(/^\uFEFF/, '')
        .trim()
        .split('\r\n');
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
      expect(lines[1]).toContain('1299.50');

      await request(app.getHttpServer()).get('/api/admin/orders').expect(401);
      const { c } = await customer(app, 'c@example.com');
      await c.get('/api/admin/orders').expect(403);
      await (
        await staffClient(app, prisma, 'INVENTORY_MANAGER')
      )
        .get('/api/admin/orders')
        .expect(200);
    });

    it('shows staff the payments, refunds, history with actors and the allowed actions', async () => {
      const o = await order({ status: 'CONFIRMED' });
      await prisma.payment.create({
        data: { orderId: o.id, provider: 'cod', amount: o.grandTotal, status: 'CREATED' },
      });
      let d = (await admin.get(`/api/admin/orders/${o.orderNumber}`).expect(200)).body.data;
      expect(d.actions).toEqual({
        statuses: ['PROCESSING', 'PACKED'],
        canShip: true,
        canAddTrackingEvent: false,
        canCancel: true,
        refundable: 0,
        refundIsManual: false,
      });
      expect(d.items).toHaveLength(1);
      expect(d.customer).toBeNull();
      expect(
        (await admin.get(`/api/admin/orders/${o.orderNumber}/invoice`).expect(404)).body.error.code,
      ).toBe('INVOICE_NOT_READY');

      await admin
        .post(`/api/admin/orders/${o.orderNumber}/status`, { status: 'PACKED', note: 'Boxed' })
        .expect(200);
      d = (await admin.get(`/api/admin/orders/${o.orderNumber}`).expect(200)).body.data;
      expect(d.actions.statuses).toEqual([]);
      expect(d.history.at(-1)).toMatchObject({
        from: 'CONFIRMED',
        to: 'PACKED',
        note: 'Boxed',
        actor: 'ADMIN',
      });
      expect(d.payments[0]).toMatchObject({ provider: 'cod', status: 'CREATED' });

      // Delivered COD order with the cash collected can be refunded manually.
      await prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
      await prisma.payment.updateMany({
        where: { orderId: o.id },
        data: { status: 'CAPTURED', capturedAt: new Date() },
      });
      d = (await admin.get(`/api/admin/orders/${o.orderNumber}`).expect(200)).body.data;
      expect(d.actions).toMatchObject({
        canCancel: false,
        refundable: o.grandTotal,
        refundIsManual: true,
      });
      await admin
        .post(`/api/admin/orders/${o.orderNumber}/refunds`, {
          reason: 'Cancelled after delivery attempt',
        })
        .expect(201);
      d = (await admin.get(`/api/admin/orders/${o.orderNumber}`).expect(200)).body.data;
      expect(d.staffRefunds[0]).toMatchObject({
        status: 'PENDING',
        manual: true,
        actor: 'ADMIN',
        amount: o.grandTotal,
      });
      expect(d.actions.refundable).toBe(0);
      const queue = (await admin.get('/api/admin/orders?status=refund_pending').expect(200)).body;
      expect(queue.data.map((r: { orderNumber: string }) => r.orderNumber)).toEqual([
        o.orderNumber,
      ]);
    });

    it('lists the returns queue oldest first', async () => {
      const a = await order({ status: 'RETURN_REQUESTED', name: 'First' });
      const b = await order({ status: 'RETURN_REQUESTED', name: 'Second' });
      const items = (await prisma.orderItem.findMany({ where: { orderId: a.id } }))[0]!;
      await prisma.returnRequest.create({
        data: {
          orderId: a.id,
          type: 'RETURN',
          reason: 'DAMAGED',
          items: [{ orderItemId: items.id, quantity: 2 }],
          createdAt: new Date(Date.now() - 60_000),
        },
      });
      await prisma.returnRequest.create({
        data: { orderId: b.id, type: 'REPLACEMENT', reason: 'WRONG_ITEM', items: [] },
      });
      await prisma.returnRequest.create({
        data: { orderId: b.id, type: 'RETURN', reason: 'OTHER', items: [], status: 'COMPLETED' },
      });
      const open = (await admin.get('/api/admin/returns').expect(200)).body;
      expect(
        open.data.map((r: { customerName: string; units: number }) => [r.customerName, r.units]),
      ).toEqual([
        ['First', 2],
        ['Second', 0],
      ]);
      expect((await admin.get('/api/admin/returns?status=all').expect(200)).body.meta.total).toBe(
        3,
      );
      expect(
        (await admin.get('/api/admin/orders?status=returns').expect(200)).body.meta.total,
      ).toBe(2);
    });
  });

  describe('customers', () => {
    it('lists customers with order stats, searches and sorts', async () => {
      const { user: asha } = await customer(app, 'asha@example.com', 'Asha Rao');
      const { user: ravi } = await customer(app, 'ravi@example.com', 'Ravi Kumar');
      await order({ userId: asha.id, total: 50_000 });
      await order({ userId: asha.id, total: 70_000, status: 'CANCELLED' });
      await order({ userId: ravi.id, total: 90_000, status: 'DELIVERED' });
      await order({ userId: ravi.id, total: 10_000, status: 'PAYMENT_PENDING' });

      const list = (await admin.get('/api/admin/customers?sort=spent').expect(200)).body;
      expect(list.meta.total).toBe(2); // staff accounts are not customers
      expect(
        list.data.map((c: { name: string; orderCount: number; totalSpent: number }) => [
          c.name,
          c.orderCount,
          c.totalSpent,
        ]),
      ).toEqual([
        ['Ravi Kumar', 2, 90_000],
        ['Asha Rao', 2, 50_000],
      ]);
      expect((await admin.get('/api/admin/customers?q=ASHA').expect(200)).body.data[0].id).toBe(
        asha.id,
      );

      const detail = (await admin.get(`/api/admin/customers/${asha.id}`).expect(200)).body.data;
      expect(detail).toMatchObject({
        email: 'asha@example.com',
        activeSessions: 1,
        status: 'ACTIVE',
      });
      expect(detail.recentOrders).toHaveLength(2);
      const staff = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
      await admin.get(`/api/admin/customers/${staff.id}`).expect(404);
    });

    it('suspends (signing the customer out everywhere) and reactivates', async () => {
      const { c, user } = await customer(app, 'asha@example.com');
      await c.get('/api/users/me').expect(200);
      const noReason = await admin
        .post(`/api/admin/customers/${user.id}/status`, { status: 'SUSPENDED' })
        .expect(422);
      expect(noReason.body.error.details[0].path).toBe('reason');

      const support = await staffClient(app, prisma, 'CUSTOMER_SUPPORT');
      await support.get(`/api/admin/customers/${user.id}`).expect(200);
      await support
        .post(`/api/admin/customers/${user.id}/status`, { status: 'SUSPENDED', reason: 'Fraud' })
        .expect(403);

      const suspended = (
        await admin
          .post(`/api/admin/customers/${user.id}/status`, {
            status: 'SUSPENDED',
            reason: 'Chargeback fraud',
          })
          .expect(200)
      ).body.data;
      expect(suspended).toMatchObject({ status: 'SUSPENDED', activeSessions: 0 });
      await c.get('/api/users/me').expect(401);
      const again = await browser(app);
      const login = await again
        .post('/api/auth/login', { identifier: 'asha@example.com', password: 'Tulsi-garden-42' })
        .expect(403);
      expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');
      expect(
        await prisma.auditLog.count({ where: { action: 'customer.suspended', entityId: user.id } }),
      ).toBe(1);

      await admin.post(`/api/admin/customers/${user.id}/status`, { status: 'ACTIVE' }).expect(200);
      await again
        .post('/api/auth/login', { identifier: 'asha@example.com', password: 'Tulsi-garden-42' })
        .expect(200);
    });
  });

  describe('coupons', () => {
    const coupon = (over: Record<string, unknown> = {}) => ({
      code: 'save10',
      type: 'PERCENTAGE',
      value: 10,
      maxDiscount: 50_000,
      minCartValue: 99_900,
      ...over,
    });

    it('validates and creates coupons; codes are unique and upper-case', async () => {
      const bad = await admin
        .post(
          '/api/admin/coupons',
          coupon({ value: 150, endsAt: '2026-01-01T00:00:00Z', startsAt: '2026-02-01T00:00:00Z' }),
        )
        .expect(422);
      expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'endsAt',
        'value',
      ]);
      await admin.post('/api/admin/coupons', coupon({ type: 'FIXED', value: 10_000 })).expect(422); // max discount on fixed
      await admin.post('/api/admin/coupons', coupon({ productIds: ['nope'] })).expect(422);

      const c = (await admin.post('/api/admin/coupons', coupon()).expect(201)).body.data;
      expect(c).toMatchObject({ code: 'SAVE10', state: 'live', usedCount: 0, discountGiven: 0 });
      expect(
        (await admin.post('/api/admin/coupons', coupon({ code: 'Save10' })).expect(409)).body.error
          .code,
      ).toBe('COUPON_EXISTS');
    });

    it('derives state, filters by it, and protects used coupons', async () => {
      const day = 86_400_000;
      const live = (await admin.post('/api/admin/coupons', coupon({ code: 'LIVE10' })).expect(201))
        .body.data;
      await admin
        .post(
          '/api/admin/coupons',
          coupon({ code: 'SOON10', startsAt: new Date(Date.now() + day).toISOString() }),
        )
        .expect(201);
      await admin
        .post(
          '/api/admin/coupons',
          coupon({
            code: 'OLD10',
            startsAt: new Date(Date.now() - 2 * day).toISOString(),
            endsAt: new Date(Date.now() - day).toISOString(),
          }),
        )
        .expect(201);
      await admin
        .post('/api/admin/coupons', coupon({ code: 'OFF10', isActive: false }))
        .expect(201);
      const codes = async (state: string) =>
        (await admin.get(`/api/admin/coupons?state=${state}`).expect(200)).body.data.map(
          (c: { code: string }) => c.code,
        );
      expect(await codes('live')).toEqual(['LIVE10']);
      expect(await codes('scheduled')).toEqual(['SOON10']);
      expect(await codes('expired')).toEqual(['OLD10']);
      expect(await codes('inactive')).toEqual(['OFF10']);
      expect((await admin.get('/api/admin/coupons?q=old').expect(200)).body.data).toHaveLength(1);

      // Simulate two redemptions.
      const o = await order({});
      await prisma.coupon.update({ where: { id: live.id }, data: { usedCount: 2 } });
      await prisma.couponUsage.create({
        data: { couponId: live.id, orderId: o.id, email: 'a@example.com', discount: 5_000 },
      });
      expect(
        (await admin.get(`/api/admin/coupons/${live.id}`).expect(200)).body.data.discountGiven,
      ).toBe(5_000);
      expect(
        (await admin.put(`/api/admin/coupons/${live.id}`, coupon({ code: 'RENAMED' })).expect(409))
          .body.error.code,
      ).toBe('COUPON_IN_USE');
      expect(
        (
          await admin
            .put(`/api/admin/coupons/${live.id}`, coupon({ code: 'LIVE10', usageLimit: 1 }))
            .expect(422)
        ).body.error.details[0].path,
      ).toBe('usageLimit');
      const exhausted = (
        await admin
          .put(`/api/admin/coupons/${live.id}`, coupon({ code: 'LIVE10', usageLimit: 2 }))
          .expect(200)
      ).body.data;
      expect(exhausted.state).toBe('exhausted');
      expect(
        (await admin.delete(`/api/admin/coupons/${live.id}`).expect(409)).body.error.code,
      ).toBe('COUPON_IN_USE');
      const off = (await admin.get('/api/admin/coupons?state=inactive').expect(200)).body.data[0];
      await admin.delete(`/api/admin/coupons/${off.id}`).expect(204);
      expect(await prisma.auditLog.count({ where: { action: { startsWith: 'coupon.' } } })).toBe(6);
    });

    it('is limited to staff who manage coupons', async () => {
      await (
        await staffClient(app, prisma, 'MANAGER')
      )
        .post('/api/admin/coupons', coupon())
        .expect(201);
      await (
        await staffClient(app, prisma, 'CUSTOMER_SUPPORT')
      )
        .get('/api/admin/coupons')
        .expect(403);
    });
  });
});
