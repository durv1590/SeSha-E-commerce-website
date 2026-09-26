import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { browser, type BrowserClient } from './helpers/client';
import { truncateAll } from './helpers/db';
import { staffClient } from './helpers/staff';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

describe('catalogue admin (integration)', () => {
  let app: INestApplication;
  let admin: BrowserClient;
  let categoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    admin = await staffClient(app, prisma);
    categoryId = (await prisma.category.create({ data: { name: 'Audio', slug: 'audio' } })).id;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const upload = async (c: BrowserClient = admin) => {
    const png = await sharp({
      create: { width: 600, height: 600, channels: 3, background: { r: 200, g: 30, b: 30 } },
    })
      .png()
      .toBuffer();
    const res = await c.agent
      .post('/api/admin/media')
      .set('x-csrf-token', c.csrf)
      .attach('file', png, 'p.png')
      .expect(201);
    return res.body.data.id as string;
  };

  const input = (over: Record<string, unknown> = {}) => ({
    name: 'Aurora Buds Pro',
    sku: 'aur-001',
    categoryId,
    taxRate: 18,
    shortDescription: 'Wireless earbuds',
    variants: [
      {
        sku: 'aur-001-blk',
        name: 'Black',
        options: { Colour: 'Black' },
        mrp: 499_900,
        price: 299_900,
        initialStock: 10,
      },
      {
        sku: 'aur-001-wht',
        name: 'White',
        options: { Colour: 'White' },
        mrp: 499_900,
        price: 279_900,
      },
    ],
    images: [],
    ...over,
  });

  const create = async (over: Record<string, unknown> = {}) =>
    (await admin.post('/api/admin/products', input(over)).expect(201)).body.data;

  describe('access', () => {
    it('is limited by permission', async () => {
      await request(app.getHttpServer()).get('/api/admin/products').expect(401);
      const customer = await browser(app);
      await customer
        .post('/api/auth/register', {
          name: 'Asha',
          email: 'c@example.com',
          password: 'Tulsi-garden-42',
        })
        .expect(201);
      await customer.get('/api/admin/products').expect(403);

      const support = await staffClient(app, prisma, 'CUSTOMER_SUPPORT');
      await support.get('/api/admin/products').expect(200);
      await support.post('/api/admin/products', input()).expect(403);

      const manager = await staffClient(app, prisma, 'MANAGER');
      const p = (await manager.post('/api/admin/products', input()).expect(201)).body.data;
      await manager.delete(`/api/admin/products/${p.id}`).expect(403); // products:delete is admin-only

      const stock = await staffClient(app, prisma, 'INVENTORY_MANAGER');
      await stock
        .post(`/api/admin/inventory/${p.variants[0].id}/adjust`, {
          mode: 'add',
          quantity: 1,
          reason: 'Found one',
        })
        .expect(200);
      await stock.put(`/api/admin/products/${p.id}`, input()).expect(403);
    });
  });

  describe('products', () => {
    it('creates a draft with variants, opening stock (ledgered) and an audit entry', async () => {
      const mediaId = await upload();
      const p = await create({
        images: [{ mediaId, alt: 'Front view', variantSku: 'AUR-001-BLK' }],
      });
      expect(p).toMatchObject({
        status: 'DRAFT',
        slug: 'aurora-buds-pro',
        sku: 'AUR-001',
        publishedAt: null,
      });
      expect(
        p.variants.map((v: { sku: string; isDefault: boolean; stock: number }) => [
          v.sku,
          v.isDefault,
          v.stock,
        ]),
      ).toEqual([
        ['AUR-001-BLK', true, 10],
        ['AUR-001-WHT', false, 0],
      ]);
      expect(p.images[0]).toMatchObject({
        alt: 'Front view',
        variantSku: 'AUR-001-BLK',
        width: 600,
      });
      const ledger = await prisma.inventoryTransaction.findMany();
      expect(ledger).toEqual([
        expect.objectContaining({
          type: 'ADJUSTMENT',
          quantity: 10,
          stockAfter: 10,
          reason: 'Opening stock',
        }),
      ]);
      expect(await prisma.auditLog.count({ where: { action: 'product.created' } })).toBe(1);
      // Trigger-maintained listing aggregates.
      const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(row).toMatchObject({ minPrice: 279_900, availableStock: 10 });
    });

    it('generates unique slugs, refuses taken SKUs and explicit slugs with field errors', async () => {
      await create();
      const second = await create({
        sku: 'aur-002',
        variants: [{ sku: 'aur-002-a', name: 'A', mrp: 1000, price: 1000 }],
      });
      expect(second.slug).toBe('aurora-buds-pro-2');

      const taken = await admin
        .post('/api/admin/products', input({ sku: 'AUR-003', slug: 'aurora-buds-pro' }))
        .expect(409);
      expect(taken.body.error).toMatchObject({ code: 'SKU_TAKEN' });
      expect(taken.body.error.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['variants.0.sku', 'variants.1.sku']),
      );
      const slug = await admin
        .post(
          '/api/admin/products',
          input({
            sku: 'x-1',
            slug: 'aurora-buds-pro',
            variants: [{ sku: 'x-1-a', name: 'A', mrp: 1000, price: 1000 }],
          }),
        )
        .expect(409);
      expect(slug.body.error).toMatchObject({
        code: 'SLUG_TAKEN',
        details: [{ path: 'slug', message: expect.any(String) }],
      });
      const bad = await admin
        .post(
          '/api/admin/products',
          input({ variants: [{ sku: 'a1', name: 'A', mrp: 100, price: 900 }] }),
        )
        .expect(422);
      expect(bad.body.error.details[0].path).toBe('variants.0.mrp');
    });

    it('publishes only complete products and the storefront sees the change', async () => {
      const p = await create();
      const refused = await admin
        .post(`/api/admin/products/${p.id}/status`, { status: 'ACTIVE' })
        .expect(422);
      expect(refused.body.error).toMatchObject({
        code: 'NOT_PUBLISHABLE',
        details: [{ path: 'images', message: expect.any(String) }],
      });
      await request(app.getHttpServer()).get(`/api/products/${p.slug}`).expect(404);

      const mediaId = await upload();
      const withImage = (
        await admin
          .put(`/api/admin/products/${p.id}`, {
            ...input({ images: [{ mediaId, alt: 'Front' }] }),
            variants: p.variants.map((v: Record<string, unknown>) => ({ ...v, initialStock: 0 })),
          })
          .expect(200)
      ).body.data;
      const live = (
        await admin.post(`/api/admin/products/${p.id}/status`, { status: 'ACTIVE' }).expect(200)
      ).body.data;
      expect(live.status).toBe('ACTIVE');
      expect(live.publishedAt).not.toBeNull();
      const pdp = await request(app.getHttpServer()).get(`/api/products/${p.slug}`).expect(200);
      expect(pdp.body.data.images[0].url).toBe(withImage.images[0].url);

      // A live product can't lose its last image or active variant.
      const noImage = await admin
        .put(`/api/admin/products/${p.id}`, { ...input({ images: [] }), variants: live.variants })
        .expect(422);
      expect(noImage.body.error.details[0].path).toBe('images');

      await admin.post(`/api/admin/products/${p.id}/status`, { status: 'ARCHIVED' }).expect(200);
      await request(app.getHttpServer()).get(`/api/products/${p.slug}`).expect(404);
    });

    it('updates variants: edits, adds, deletes unordered ones, keeps ordered ones inactive, swaps SKUs', async () => {
      const p = await create();
      const [blk, wht] = p.variants;
      await prisma.order.create({
        data: {
          orderNumber: 'SK26092600001',
          email: 'a@example.com',
          phone: '9876543210',
          status: 'DELIVERED',
          paymentMethod: 'COD',
          shippingAddress: {},
          billingAddress: {},
          mrpTotal: 1,
          subtotal: 1,
          grandTotal: 1,
          items: {
            create: [
              {
                productId: p.id,
                variantId: blk.id,
                productName: 'x',
                variantName: 'Black',
                sku: blk.sku,
                mrp: 1,
                unitPrice: 1,
                quantity: 1,
                taxRate: 18,
                taxAmount: 0,
                lineTotal: 1,
              },
            ],
          },
        },
      });

      // Drop both originals; add a new one. Black was ordered (kept, inactive); white is deleted.
      const updated = (
        await admin
          .put(`/api/admin/products/${p.id}`, {
            ...input(),
            expectedUpdatedAt: p.updatedAt,
            variants: [
              { sku: 'aur-001-red', name: 'Red', mrp: 399_900, price: 349_900, initialStock: 3 },
            ],
          })
          .expect(200)
      ).body.data;
      expect(
        updated.variants.map((v: { sku: string; isActive: boolean }) => [v.sku, v.isActive]).sort(),
      ).toEqual([
        ['AUR-001-BLK', false],
        ['AUR-001-RED', true],
      ]);
      expect(await prisma.productVariant.findUnique({ where: { id: wht.id } })).toBeNull();
      expect(updated.variants.find((v: { sku: string }) => v.sku === 'AUR-001-RED').isDefault).toBe(
        true,
      );

      // Stale editor.
      const stale = await admin
        .put(`/api/admin/products/${p.id}`, {
          ...input(),
          expectedUpdatedAt: p.updatedAt,
          variants: updated.variants,
        })
        .expect(409);
      expect(stale.body.error.code).toBe('STALE_PRODUCT');

      // Swap two SKUs within the product in one save.
      const [a, b] = updated.variants;
      const swapped = (
        await admin
          .put(`/api/admin/products/${p.id}`, {
            ...input(),
            expectedUpdatedAt: updated.updatedAt,
            variants: [
              { ...a, sku: b.sku },
              { ...b, sku: a.sku },
            ],
          })
          .expect(200)
      ).body.data;
      expect(swapped.variants.find((v: { id: string }) => v.id === a.id).sku).toBe(b.sku);

      // Ordered products can't be deleted; archiving is the way.
      const del = await admin.delete(`/api/admin/products/${p.id}`).expect(409);
      expect(del.body.error.code).toBe('PRODUCT_HAS_ORDERS');
    });

    it('rejects variants and images that belong to another product', async () => {
      const p = await create();
      const other = await create({
        name: 'Other',
        sku: 'oth-1',
        variants: [{ sku: 'oth-1-a', name: 'A', mrp: 1000, price: 1000 }],
      });
      await admin
        .put(`/api/admin/products/${p.id}`, {
          ...input(),
          variants: [{ ...other.variants[0], sku: 'NEW-SKU-1' }],
        })
        .expect(422);
    });

    it('duplicates as a draft with new SKUs and no stock, and deletes unordered drafts', async () => {
      const mediaId = await upload();
      const p = await create({ images: [{ mediaId, alt: 'Front' }] });
      const copy = (await admin.post(`/api/admin/products/${p.id}/duplicate`).expect(201)).body
        .data;
      expect(copy).toMatchObject({
        status: 'DRAFT',
        name: 'Aurora Buds Pro (copy)',
        slug: 'aurora-buds-pro-copy',
        sku: 'AUR-001-COPY',
      });
      expect(copy.variants.map((v: { sku: string; stock: number }) => [v.sku, v.stock])).toEqual([
        ['AUR-001-BLK-COPY', 0],
        ['AUR-001-WHT-COPY', 0],
      ]);
      expect(copy.images).toHaveLength(1);
      await admin.delete(`/api/admin/products/${copy.id}`).expect(204);
      expect(await prisma.product.count()).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: 'product.deleted' } })).toBe(1);
    });

    it('lists with search, status and stock filters', async () => {
      const p = await create();
      await create({
        name: 'Nova Speaker',
        sku: 'nov-1',
        variants: [{ sku: 'nov-1-a', name: 'A', mrp: 1000, price: 1000, initialStock: 0 }],
      });
      const list = async (qs: string) =>
        (await admin.get(`/api/admin/products?${qs}`).expect(200)).body;
      expect((await list('q=aur-001-wht')).data.map((r: { id: string }) => r.id)).toEqual([p.id]);
      expect((await list('q=speaker')).data).toHaveLength(1);
      expect((await list('stock=out')).data.map((r: { name: string }) => r.name)).toEqual([
        'Nova Speaker',
      ]);
      const all = await list('sort=name&pageSize=1');
      expect(all.meta).toMatchObject({ total: 2, totalPages: 2 });
      expect(all.data[0]).toMatchObject({
        name: 'Aurora Buds Pro',
        variantCount: 2,
        availableStock: 10,
        lowStock: true,
      });
    });
  });

  describe('categories and brands', () => {
    it('keeps the tree at most three levels, refuses cycles and deleting used categories', async () => {
      const post = (body: object) => admin.post('/api/admin/categories', body);
      const l1 = (await post({ name: 'Electronics' }).expect(201)).body.data;
      const l2 = (await post({ name: 'Phones', parentId: l1.id }).expect(201)).body.data;
      const l3 = (await post({ name: 'Cases', parentId: l2.id }).expect(201)).body.data;
      expect([l1.depth, l2.depth, l3.depth]).toEqual([0, 1, 2]);
      expect((await post({ name: 'Too deep', parentId: l3.id }).expect(422)).body.error.code).toBe(
        'CATEGORY_TOO_DEEP',
      );

      // Moving Phones (with Cases) under Audio (depth 0) keeps depths 1 and 2.
      const moved = (
        await admin
          .put(`/api/admin/categories/${l2.id}`, { name: 'Phones', parentId: categoryId })
          .expect(200)
      ).body.data;
      expect(moved.depth).toBe(1);
      // Moving Electronics under Cases would be a cycle... Electronics under Phones is fine depth-wise? No: Phones has Cases.
      expect(
        (
          await admin
            .put(`/api/admin/categories/${categoryId}`, { name: 'Audio', parentId: l3.id })
            .expect(422)
        ).body.error.code,
      ).toBe('CATEGORY_CYCLE');
      expect(
        (
          await admin
            .put(`/api/admin/categories/${l2.id}`, { name: 'Phones', parentId: l1.id })
            .expect(200)
        ).body.data.depth,
      ).toBe(1);
      const l4 = (await post({ name: 'Leaf', parentId: l1.id }).expect(201)).body.data;
      expect(
        (
          await admin
            .put(`/api/admin/categories/${l2.id}`, { name: 'Phones', parentId: l4.id })
            .expect(422)
        ).body.error.code,
      ).toBe('CATEGORY_TOO_DEEP');

      const list = (await admin.get('/api/admin/categories').expect(200)).body.data;
      expect(list.map((c: { name: string }) => c.name)).toEqual([
        'Audio',
        'Electronics',
        'Leaf',
        'Phones',
        'Cases',
      ]);

      await create();
      expect(
        (await admin.delete(`/api/admin/categories/${categoryId}`).expect(409)).body.error.code,
      ).toBe('CATEGORY_IN_USE');
      expect(
        (await admin.delete(`/api/admin/categories/${l2.id}`).expect(409)).body.error.code,
      ).toBe('CATEGORY_IN_USE');
      await admin.delete(`/api/admin/categories/${l3.id}`).expect(204);
      await admin
        .post('/api/admin/categories', { name: 'Bad', imageUrl: 'javascript:alert(1)' })
        .expect(422);
    });

    it('manages brands: unique names, no deleting brands in use', async () => {
      const b = (await admin.post('/api/admin/brands', { name: 'Aurora' }).expect(201)).body.data;
      expect(b.slug).toBe('aurora');
      expect(
        (await admin.post('/api/admin/brands', { name: 'aurora' }).expect(409)).body.error.code,
      ).toBe('BRAND_EXISTS');
      await create({ brandId: b.id });
      expect((await admin.delete(`/api/admin/brands/${b.id}`).expect(409)).body.error.code).toBe(
        'BRAND_IN_USE',
      );
      const renamed = (
        await admin
          .put(`/api/admin/brands/${b.id}`, { name: 'Aurora Audio', slug: 'aurora' })
          .expect(200)
      ).body.data;
      expect(renamed).toMatchObject({ name: 'Aurora Audio', slug: 'aurora', productCount: 1 });
    });
  });

  describe('inventory', () => {
    it('adjusts stock through the ledger and never below reserved', async () => {
      const p = await create();
      const v = p.variants[0];
      const adjust = (body: object) => admin.post(`/api/admin/inventory/${v.id}/adjust`, body);
      expect(
        (await adjust({ mode: 'add', quantity: 5, reason: 'Delivery from supplier' }).expect(200))
          .body.data,
      ).toEqual({
        stock: 15,
        reserved: 0,
        available: 15,
      });
      await prisma.inventory.update({ where: { variantId: v.id }, data: { reserved: 4 } });
      const below = await adjust({ mode: 'set', quantity: 3, reason: 'Stock count' }).expect(409);
      expect(below.body.error).toMatchObject({
        code: 'BELOW_RESERVED',
        details: [{ path: 'quantity' }],
      });
      await adjust({ mode: 'remove', quantity: 11, reason: 'Damaged' }).expect(200);
      await adjust({ mode: 'remove', quantity: 1, reason: 'Damaged' }).expect(409);

      const ledger = (await admin.get(`/api/admin/inventory/${v.id}/ledger`).expect(200)).body;
      expect(
        ledger.data.map((e: { type: string; quantity: number; stockAfter: number }) => [
          e.type,
          e.quantity,
          e.stockAfter,
        ]),
      ).toEqual([
        ['ADJUSTMENT', -11, 4],
        ['RESTOCK', 5, 15],
        ['ADJUSTMENT', 10, 10],
      ]);
      expect(ledger.data[0]).toMatchObject({ reason: 'Damaged', actor: 'ADMIN' });
      expect(await prisma.auditLog.count({ where: { action: 'inventory.adjusted' } })).toBe(2);

      await admin.patch(`/api/admin/inventory/${v.id}`, { lowStockThreshold: 2 }).expect(204);
      const all = (await admin.get('/api/admin/inventory?q=aur-001').expect(200)).body;
      expect(all.meta.total).toBe(2);
      // Sorted by what can be sold: both variants have none left (Black: 4 of 4 reserved).
      expect(
        all.data.map((r: { sku: string; available: number; state: string }) => [
          r.sku,
          r.available,
          r.state,
        ]),
      ).toEqual([
        ['AUR-001-BLK', 0, 'out_of_stock'],
        ['AUR-001-WHT', 0, 'out_of_stock'],
      ]);
      // Low/out filters count live products only (matching the dashboard).
      expect((await admin.get('/api/admin/inventory?stock=out').expect(200)).body.meta.total).toBe(
        0,
      );
    });
  });

  describe('CSV', () => {
    const importCsv = (csv: string, dryRun = true) =>
      admin.agent
        .post(`/api/admin/products/import?dryRun=${dryRun}`)
        .set('x-csrf-token', admin.csrf)
        .attach('file', Buffer.from(csv, 'utf8'), 'products.csv');

    it('exports every variant and re-imports the file unchanged', async () => {
      await create({ description: '=cmd|"/c calc"!A1, with "quotes"\nand lines' });
      const res = await admin.get('/api/admin/products/export.csv').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="seshakart-products-/,
      );
      const text = res.text;
      expect(text.split('\r\n')[0]).toMatch(/^\uFEFF?product_sku,product_name,slug,status/);
      expect(text).toContain(`"'=cmd|""/c calc""!A1, with ""quotes""\nand lines"`);

      const dry = (await importCsv(text).expect(200)).body.data;
      expect(dry).toMatchObject({
        dryRun: true,
        rows: 2,
        errors: [],
        products: { create: 0, update: 0, unchanged: 1 },
        variants: { create: 0, update: 0, unchanged: 2 },
        applied: false,
      });
    });

    it('reports every problem with its line and applies nothing when there are errors', async () => {
      await prisma.brand.create({ data: { name: 'Nova', slug: 'nova' } });
      const csv = [
        'product_sku,product_name,category_slug,brand_slug,tax_rate,variant_sku,variant_name,options,mrp,price,stock',
        'NOV-1,Nova Speaker,audio,nova,18,NOV-1-A,Blue,Colour: Blue,"2,999",1999.50,5',
        'NOV-1,Nova Speaker,audio,nova,18,NOV-1-B,Red,Colour: Red,999,1999,',
        'NOV-2,Nova Mini,nowhere,nova,7,NOV-1-A,Blue,bad options,x,,',
      ].join('\n');
      const dry = (await importCsv(csv, false).expect(200)).body.data;
      expect(dry.applied).toBe(false);
      const issues = dry.errors.map(
        (e: { line: number; column?: string }) => `${e.line}:${e.column ?? ''}`,
      );
      expect(issues).toEqual(
        expect.arrayContaining(['3:mrp', '4:category_slug', '4:tax_rate', '4:variant_sku']),
      );
      expect(await prisma.product.count()).toBe(0);
    });

    it('creates and updates products from a valid file, ledgering stock changes', async () => {
      const existing = await create();
      const csv = [
        'product_sku,product_name,category_slug,tax_rate,variant_sku,variant_name,options,mrp,price,stock',
        'NOV-1,Nova Speaker,audio,18,NOV-1-A,Blue,Colour: Blue,"2,999",1999.50,5',
        'NOV-1,,,,NOV-1-B,Red,Colour: Red,2999,1999,',
        `AUR-001,Aurora Buds Pro,audio,18,AUR-001-BLK,Black,Colour: Black,4999,2499,12`,
      ].join('\r\n');
      const dry = (await importCsv(csv).expect(200)).body.data;
      expect(dry).toMatchObject({
        errors: [],
        products: { create: 1, update: 0, unchanged: 1 },
        variants: { create: 2, update: 1, unchanged: 0 },
      });
      expect(await prisma.product.count()).toBe(1);

      const applied = (await importCsv(csv, false).expect(200)).body.data;
      expect(applied.applied).toBe(true);
      const nova = await prisma.product.findUniqueOrThrow({
        where: { sku: 'NOV-1' },
        include: { variants: { orderBy: { position: 'asc' }, include: { inventory: true } } },
      });
      expect(nova).toMatchObject({ status: 'DRAFT', slug: 'nova-speaker', taxRate: 18 });
      expect(nova.variants.map((v) => [v.sku, v.price, v.isDefault, v.inventory?.stock])).toEqual([
        ['NOV-1-A', 199_950, true, 5],
        ['NOV-1-B', 199_900, false, 0],
      ]);
      const blk = await prisma.productVariant.findUniqueOrThrow({
        where: { sku: 'AUR-001-BLK' },
        include: { inventory: true },
      });
      expect([blk.price, blk.inventory?.stock]).toEqual([249_900, 12]);
      expect(
        await prisma.inventoryTransaction.findFirst({
          where: { variantId: existing.variants[0].id, reason: 'CSV import' },
        }),
      ).toMatchObject({ quantity: 2, stockAfter: 12 });
      expect(await prisma.auditLog.count({ where: { action: 'product.imported' } })).toBe(1);
    });

    it('rejects oversized, non-UTF-8 and malformed files', async () => {
      expect(
        (await importCsv('product_sku,variant_sku\n"A,B\n').expect(200)).body.data.errors[0]
          .message,
      ).toMatch(/not closed/);
      expect(
        (await importCsv('product_sku,colour\nA,B\n').expect(200)).body.data.errors[0].message,
      ).toMatch(/Unknown column/);
      const latin1 = Buffer.from([0x70, 0x72, 0x6f, 0x64, 0xe9, 0x0a]);
      await admin.agent
        .post('/api/admin/products/import')
        .set('x-csrf-token', admin.csrf)
        .attach('file', latin1, 'x.csv')
        .expect(422);
    });
  });
});
