import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { istDayStart } from '../src/admin/dashboard.service';
import { createTestApp } from './helpers/app';
import { browser } from './helpers/client';
import { truncateAll } from './helpers/db';
import { staffClient } from './helpers/staff';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const DAY = 86_400_000;
let seq = 0;

async function orderAt(
  placedAt: Date,
  grandTotal: number,
  status: 'CONFIRMED' | 'CANCELLED' | 'PAYMENT_PENDING' | 'DELIVERED' = 'CONFIRMED',
) {
  const n = ++seq;
  return prisma.order.create({
    data: {
      orderNumber: `SK2609260${String(n).padStart(5, '0')}`,
      email: 'a@example.com',
      phone: '9876543210',
      status,
      paymentMethod: 'COD',
      shippingAddress: { name: `Customer ${n}` },
      billingAddress: {},
      mrpTotal: grandTotal,
      subtotal: grandTotal,
      grandTotal,
      placedAt,
      confirmedAt: status === 'PAYMENT_PENDING' ? null : placedAt,
      items: {
        create: [
          {
            productName: `Item ${n}`,
            variantName: '',
            sku: `S${n}`,
            mrp: grandTotal,
            unitPrice: grandTotal,
            quantity: 1,
            taxRate: 18,
            taxAmount: 0,
            lineTotal: grandTotal,
          },
        ],
      },
    },
  });
}

describe('admin foundation (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => truncateAll(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('dashboard', () => {
    it('is for staff with dashboard access only', async () => {
      await request(app.getHttpServer()).get('/api/admin/dashboard').expect(401);
      const customer = await browser(app);
      await customer
        .post('/api/auth/register', {
          name: 'Asha',
          email: 'c@example.com',
          password: 'Tulsi-garden-42',
        })
        .expect(201);
      await customer.get('/api/admin/dashboard').expect(403);
      await (
        await staffClient(app, prisma, 'INVENTORY_MANAGER')
      )
        .get('/api/admin/dashboard')
        .expect(200);
    });

    it('computes sales KPIs, trends, the daily series, queues and top products', async () => {
      const now = new Date();
      const today = istDayStart(now);
      await orderAt(new Date(today.getTime() + 60_000), 100_000); // today
      await orderAt(new Date(today.getTime() + 120_000), 50_000, 'DELIVERED'); // today
      await orderAt(new Date(today.getTime() + 180_000), 999_999, 'CANCELLED'); // never counted
      await orderAt(new Date(today.getTime() + 240_000), 777_777, 'PAYMENT_PENDING'); // not a sale yet
      await orderAt(new Date(today.getTime() - 3 * DAY), 30_000); // this week
      await orderAt(new Date(today.getTime() - 10 * DAY), 20_000); // previous week, this month
      await orderAt(new Date(today.getTime() - 40 * DAY), 10_000); // previous 30 days

      const d = (await (await staffClient(app, prisma)).get('/api/admin/dashboard').expect(200))
        .body.data;
      expect(d.today).toMatchObject({
        revenue: 150_000,
        orders: 2,
        averageOrderValue: 75_000,
        previous: { revenue: 0, orders: 0 },
      });
      expect(d.last7Days).toMatchObject({
        revenue: 180_000,
        orders: 3,
        previous: { revenue: 20_000, orders: 1 },
      });
      expect(d.last30Days).toMatchObject({
        revenue: 200_000,
        orders: 4,
        previous: { revenue: 10_000, orders: 1 },
      });
      expect(d.daily).toHaveLength(30);
      expect(d.daily[29]).toMatchObject({ revenue: 150_000, orders: 2 });
      expect(d.daily[26]).toMatchObject({ revenue: 30_000, orders: 1 });
      expect(d.queues).toMatchObject({
        toShip: 4,
        paymentPending: 1,
        openReturns: 0,
        pendingReviews: 0,
      });
      expect(d.recentOrders).toHaveLength(7);
      expect(d.recentOrders[0]).toMatchObject({
        statusLabel: expect.any(String),
        customer: expect.stringMatching(/^Customer /),
      });
      expect(d.topProducts[0]).toMatchObject({ name: 'Item 1', units: 1, revenue: 100_000 });
    });
  });

  describe('image uploads', () => {
    const png = (w = 400, h = 300) =>
      sharp({ create: { width: w, height: h, channels: 3, background: { r: 11, g: 95, b: 255 } } })
        .png()
        .toBuffer();

    it('re-encodes valid images to WebP and records them', async () => {
      const admin = await staffClient(app, prisma);
      const jpeg = await sharp(await png(3000, 1500))
        .jpeg()
        .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-owner' } } })
        .toBuffer();
      const res = await admin.agent
        .post('/api/admin/media')
        .set('x-csrf-token', admin.csrf)
        .attach('file', jpeg, 'holiday.jpg')
        .expect(201);
      expect(res.body.data).toMatchObject({ width: 2000, height: 1000 });
      expect(res.body.data.url).toMatch(
        /^\/api\/media\/uploads\/\d{4}\/\d{2}\/[a-f0-9]{20}\.webp$/,
      );
      const stored = await request(app.getHttpServer())
        .get(res.body.data.url)
        .buffer(true)
        .parse((r, cb) => {
          const c: Buffer[] = [];
          r.on('data', (d: Buffer) => c.push(d));
          r.on('end', () => cb(null, Buffer.concat(c)));
        });
      const meta = await sharp(stored.body as Buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(await prisma.mediaAsset.count()).toBe(1);
    });

    it('rejects non-images, SVG, tiny images and non-staff', async () => {
      const admin = await staffClient(app, prisma);
      const post = (buf: Buffer, name: string) =>
        admin.agent
          .post('/api/admin/media')
          .set('x-csrf-token', admin.csrf)
          .attach('file', buf, name);
      expect(
        (await post(Buffer.from('not really a png'), 'x.png').expect(422)).body.error.code,
      ).toBe('INVALID_IMAGE');
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><script>alert(1)</script></svg>',
      );
      expect(['INVALID_IMAGE', 'UNSUPPORTED_IMAGE']).toContain(
        (await post(svg, 'logo.svg').expect(422)).body.error.code,
      );
      expect((await post(await png(100, 100), 'tiny.png').expect(422)).body.error.code).toBe(
        'IMAGE_TOO_SMALL',
      );
      expect(
        (await admin.agent.post('/api/admin/media').set('x-csrf-token', admin.csrf).expect(422))
          .body.error.code,
      ).toBe('FILE_REQUIRED');

      const support = await staffClient(app, prisma, 'CUSTOMER_SUPPORT');
      await support.agent
        .post('/api/admin/media')
        .set('x-csrf-token', support.csrf)
        .attach('file', await png(), 'a.png')
        .expect(403);
      expect(await prisma.mediaAsset.count()).toBe(0);
    });
  });
});
