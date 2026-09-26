import { PrismaClient } from '@prisma/client';
import { truncateAll } from './helpers/db';
import { TEST_DATABASE_URL } from './helpers/test-env';

/**
 * The database is the last line of defence for money and stock. These tests prove
 * the hand-written constraints in the migrations actually reject bad writes, even
 * if application code has a bug.
 */
describe('database constraints (integration)', () => {
  const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

  async function makeVariant(stock = 5) {
    const category = await prisma.category.create({
      data: { name: 'Audio', slug: `audio-${Date.now()}` },
    });
    const product = await prisma.product.create({
      data: {
        name: 'Earbuds',
        slug: `earbuds-${Date.now()}`,
        sku: `SK-${Date.now()}`,
        categoryId: category.id,
      },
    });
    return prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `SK-${Date.now()}-BLK`,
        name: 'Black',
        mrp: 199900,
        price: 99900,
        isDefault: true,
        inventory: { create: { stock } },
      },
      include: { inventory: true, product: true },
    });
  }

  beforeEach(() => truncateAll(prisma));
  afterAll(() => prisma.$disconnect());

  describe('inventory — overselling is impossible at the database level', () => {
    it('rejects negative stock', async () => {
      const v = await makeVariant(2);
      await expect(
        prisma.inventory.update({ where: { variantId: v.id }, data: { stock: { decrement: 3 } } }),
      ).rejects.toThrow(/inventory_stock_chk/);
    });

    it('rejects reserving more than is in stock', async () => {
      const v = await makeVariant(2);
      await expect(
        prisma.inventory.update({
          where: { variantId: v.id },
          data: { reserved: { increment: 3 } },
        }),
      ).rejects.toThrow(/inventory_stock_chk/);
    });

    it('allows concurrent reservations only up to available stock', async () => {
      const v = await makeVariant(3);
      // Ten buyers race for three units using the conditional-update pattern the checkout uses.
      const attempts = await Promise.all(
        Array.from(
          { length: 10 },
          () =>
            prisma.$executeRaw`
            UPDATE "inventory" SET "reserved" = "reserved" + 1
            WHERE "variant_id" = ${v.id} AND "stock" - "reserved" >= 1`,
        ),
      );
      expect(attempts.reduce((a, b) => a + b, 0)).toBe(3);
      const inv = await prisma.inventory.findUniqueOrThrow({ where: { variantId: v.id } });
      expect(inv).toMatchObject({ stock: 3, reserved: 3 });
    });
  });

  describe('product aggregates (triggers)', () => {
    it('keep min price, discount and available stock in sync with variants and inventory', async () => {
      const v = await makeVariant(5); // mrp 1999, price 999, stock 5
      const read = () =>
        prisma.product.findUniqueOrThrow({
          where: { id: v.productId },
          select: { minPrice: true, minPriceMrp: true, maxDiscountPct: true, availableStock: true },
        });
      expect(await read()).toEqual({
        minPrice: 99900,
        minPriceMrp: 199900,
        maxDiscountPct: 50,
        availableStock: 5,
      });

      const cheaper = await prisma.productVariant.create({
        data: {
          productId: v.productId,
          sku: `${v.sku}-W`,
          name: 'White',
          mrp: 89900,
          price: 79900,
          inventory: { create: { stock: 2 } },
        },
      });
      expect(await read()).toEqual({
        minPrice: 79900,
        minPriceMrp: 89900,
        maxDiscountPct: 50,
        availableStock: 7,
      });

      // A checkout reservation reduces available stock immediately.
      await prisma.inventory.update({ where: { variantId: v.id }, data: { reserved: 4 } });
      expect((await read()).availableStock).toBe(3);

      // Deactivated variants no longer count towards price or stock.
      await prisma.productVariant.update({ where: { id: cheaper.id }, data: { isActive: false } });
      expect(await read()).toEqual({
        minPrice: 99900,
        minPriceMrp: 199900,
        maxDiscountPct: 50,
        availableStock: 1,
      });

      await prisma.productVariant.delete({ where: { id: v.id } });
      expect(await read()).toEqual({
        minPrice: 0,
        minPriceMrp: 0,
        maxDiscountPct: 0,
        availableStock: 0,
      });
    });
  });

  describe('pricing', () => {
    it('rejects a selling price above MRP', async () => {
      const v = await makeVariant();
      await expect(
        prisma.productVariant.update({ where: { id: v.id }, data: { price: 250000 } }),
      ).rejects.toThrow(/product_variants_price_chk/);
    });

    it('rejects a zero price', async () => {
      const v = await makeVariant();
      await expect(
        prisma.productVariant.update({ where: { id: v.id }, data: { price: 0 } }),
      ).rejects.toThrow(/product_variants_price_chk/);
    });

    it('allows only valid GST slabs', async () => {
      const v = await makeVariant();
      await expect(
        prisma.product.update({ where: { id: v.productId }, data: { taxRate: 17 } }),
      ).rejects.toThrow(/products_tax_rate_chk/);
      await expect(
        prisma.product.update({ where: { id: v.productId }, data: { taxRate: 5 } }),
      ).resolves.toBeTruthy();
    });

    it('allows only one default variant per product', async () => {
      const v = await makeVariant();
      await expect(
        prisma.productVariant.create({
          data: {
            productId: v.productId,
            sku: `${v.sku}-2`,
            name: 'White',
            mrp: 100,
            price: 100,
            isDefault: true,
          },
        }),
      ).rejects.toThrow(/Unique constraint/);
    });
  });

  describe('orders', () => {
    it('enforces grand total = subtotal − coupon + shipping + COD fee', async () => {
      const base = {
        orderNumber: 'SK-T-1',
        email: 'a@b.co',
        phone: '9876543210',
        paymentMethod: 'COD' as const,
        shippingAddress: {},
        billingAddress: {},
        mrpTotal: 200000,
        subtotal: 100000,
        couponDiscount: 10000,
        shippingFee: 4900,
        codFee: 4900,
      };
      await expect(prisma.order.create({ data: { ...base, grandTotal: 1 } })).rejects.toThrow(
        /orders_amounts_chk/,
      );
      await expect(
        prisma.order.create({ data: { ...base, grandTotal: 99800 } }),
      ).resolves.toBeTruthy();
    });

    it('generates increasing order numbers from a sequence', async () => {
      const [a] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
      const [b] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('order_number_seq') AS n`;
      expect(Number(b!.n)).toBe(Number(a!.n) + 1);
    });
  });

  describe('identity & reviews', () => {
    it('requires an email or a phone, lower-case email and a valid Indian mobile', async () => {
      await expect(prisma.user.create({ data: { name: 'No contact' } })).rejects.toThrow(
        /users_email_or_phone_chk/,
      );
      await expect(prisma.user.create({ data: { name: 'Caps', email: 'A@B.CO' } })).rejects.toThrow(
        /users_email_lowercase_chk/,
      );
      await expect(
        prisma.user.create({ data: { name: 'Bad phone', phone: '12345' } }),
      ).rejects.toThrow(/users_phone_format_chk/);
    });

    it('allows only one default address per user', async () => {
      const user = await prisma.user.create({ data: { name: 'Asha', phone: '9876543210' } });
      const addr = {
        userId: user.id,
        name: 'Asha',
        phone: '9876543210',
        line1: '1 MG Road',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        isDefault: true,
      };
      await prisma.address.create({ data: addr });
      await expect(prisma.address.create({ data: addr })).rejects.toThrow(/Unique constraint/);
      await expect(
        prisma.address.create({ data: { ...addr, isDefault: false } }),
      ).resolves.toBeTruthy();
    });

    it('rejects ratings outside 1–5 and duplicate reviews per product', async () => {
      const v = await makeVariant();
      const user = await prisma.user.create({ data: { name: 'Ravi', email: 'ravi@example.com' } });
      const review = { productId: v.productId, userId: user.id, body: 'Good' };
      await expect(prisma.review.create({ data: { ...review, rating: 6 } })).rejects.toThrow(
        /reviews_rating_chk/,
      );
      await prisma.review.create({ data: { ...review, rating: 5 } });
      await expect(prisma.review.create({ data: { ...review, rating: 4 } })).rejects.toThrow(
        /Unique constraint/,
      );
    });
  });

  describe('coupons', () => {
    it('rejects percentage coupons above 100% and lower-case codes', async () => {
      await expect(
        prisma.coupon.create({ data: { code: 'BIG', type: 'PERCENTAGE', value: 150 } }),
      ).rejects.toThrow(/coupons_value_chk/);
      await expect(
        prisma.coupon.create({ data: { code: 'smart10', type: 'PERCENTAGE', value: 10 } }),
      ).rejects.toThrow(/coupons_code_upper_chk/);
    });
  });

  describe('search', () => {
    it('full-text and trigram indexes support typo-tolerant product search', async () => {
      const v = await makeVariant();
      await prisma.product.update({
        where: { id: v.productId },
        data: { name: 'Wireless Bluetooth Earbuds', status: 'ACTIVE', tags: ['audio', 'tws'] },
      });
      const fts = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products
        WHERE sk_product_search_document(name, short_description, tags, highlights) @@ plainto_tsquery('simple', 'bluetooth earbuds')`;
      expect(fts).toHaveLength(1);
      // "earbds" (typo) still matches by trigram word similarity. The default operator
      // threshold (0.6) is too strict for short words; search uses an explicit 0.5.
      const fuzzy = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM products WHERE word_similarity('earbds', name) >= 0.5`;
      expect(fuzzy).toHaveLength(1);
    });
  });
});
