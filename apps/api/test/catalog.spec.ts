import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { CacheService } from '../src/cache/cache.service';
import { StorageService } from '../src/storage/storage.service';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const DAY = 86_400_000;

/**
 * Fixture:
 *   electronics
 *     └ audio
 *         ├ earbuds   : Pods (Aurora, ₹1999/4999, stock 10), Buds (Voltix, ₹999/2499, stock 0)
 *         └ speakers  : Boom (Aurora, ₹2799/4999, 2 variants)
 *   fashion           : Tee (Voltix, ₹399/799)
 *   hidden (inactive) : Secret (should never appear)
 *   draft product in earbuds (never appears)
 */
async function fixture() {
  const cat = async (slug: string, parentId: string | null = null, depth = 0, isActive = true) =>
    prisma.category.create({
      data: { slug, name: slug[0]!.toUpperCase() + slug.slice(1), parentId, depth, isActive },
    });
  const electronics = await cat('electronics');
  const audio = await cat('audio', electronics.id, 1);
  const earbuds = await cat('earbuds', audio.id, 2);
  const speakers = await cat('speakers', audio.id, 2);
  const fashion = await cat('fashion');
  const hidden = await cat('hidden', null, 0, false);
  const aurora = await prisma.brand.create({
    data: { slug: 'aurora', name: 'Aurora', isFeatured: true },
  });
  const voltix = await prisma.brand.create({ data: { slug: 'voltix', name: 'Voltix' } });

  let n = 0;
  const product = async (
    slug: string,
    categoryId: string,
    brandId: string,
    variants: { mrp: number; price: number; stock: number; options?: Record<string, string> }[],
    extra: object = {},
  ) =>
    prisma.product.create({
      data: {
        slug,
        name: slug,
        sku: `SKU-${++n}`,
        categoryId,
        brandId,
        status: 'ACTIVE',
        publishedAt: new Date(Date.now() - 90 * DAY),
        images: {
          create: [{ url: `/api/media/test/${slug}.webp`, alt: slug, width: 1000, height: 1000 }],
        },
        variants: {
          create: variants.map((v, i) => ({
            sku: `SKU-${n}-${i}`,
            name: Object.values(v.options ?? { Variant: `V${i}` }).join(' / '),
            options: v.options ?? {},
            mrp: v.mrp * 100,
            price: v.price * 100,
            isDefault: i === 0,
            position: i,
            inventory: { create: { stock: v.stock } },
          })),
        },
        ...extra,
      },
    });

  await product('pods', earbuds.id, aurora.id, [{ mrp: 4999, price: 1999, stock: 10 }], {
    soldCount: 500,
  });
  await product('buds', earbuds.id, voltix.id, [{ mrp: 2499, price: 999, stock: 0 }], {
    soldCount: 50,
  });
  await product(
    'boom',
    speakers.id,
    aurora.id,
    [
      { mrp: 4999, price: 2799, stock: 3, options: { Colour: 'Blue' } },
      { mrp: 4999, price: 2999, stock: 20, options: { Colour: 'Orange' } },
    ],
    { soldCount: 10, publishedAt: new Date(Date.now() - 2 * DAY) },
  );
  await product('tee', fashion.id, voltix.id, [{ mrp: 799, price: 399, stock: 50 }], {
    soldCount: 5,
  });
  await product('secret', hidden.id, voltix.id, [{ mrp: 100, price: 100, stock: 5 }]);
  await product('draft', earbuds.id, aurora.id, [{ mrp: 100, price: 100, stock: 5 }], {
    status: 'DRAFT',
  });
  return { audio };
}

describe('catalogue API (integration)', () => {
  let app: INestApplication;
  const get = (path: string) => request(app.getHttpServer()).get(path);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    await app.get(CacheService).delByPrefix('catalog:');
    await fixture();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const slugs = (res: request.Response) => res.body.data.items.map((p: { slug: string }) => p.slug);

  describe('categories', () => {
    it('returns the active tree only (inactive categories and their products are hidden)', async () => {
      const res = await get('/api/categories').expect(200);
      expect(res.headers['cache-control']).toMatch(/public/);
      const roots = res.body.data.map((c: { slug: string }) => c.slug);
      expect(roots).toEqual(['electronics', 'fashion']);
      expect(res.body.data[0].children[0].children.map((c: { slug: string }) => c.slug)).toEqual([
        'earbuds',
        'speakers',
      ]);
      await get('/api/categories/hidden').expect(404);
    });

    it('returns category detail with breadcrumbs and children', async () => {
      const res = await get('/api/categories/earbuds').expect(200);
      expect(res.body.data.breadcrumbs.map((c: { slug: string }) => c.slug)).toEqual([
        'electronics',
        'audio',
        'earbuds',
      ]);
      const audio = await get('/api/categories/audio').expect(200);
      expect(audio.body.data.children.map((c: { slug: string }) => c.slug)).toEqual([
        'earbuds',
        'speakers',
      ]);
    });
  });

  describe('product listing', () => {
    it('lists only active products in active categories, sorted by popularity', async () => {
      const res = await get('/api/products').expect(200);
      expect(slugs(res)).toEqual(['pods', 'buds', 'boom', 'tee']);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 24, total: 4, totalPages: 1 });
    });

    it('includes products from every subcategory of a category', async () => {
      expect(slugs(await get('/api/products?category=audio').expect(200)).sort()).toEqual([
        'boom',
        'buds',
        'pods',
      ]);
      expect(slugs(await get('/api/products?category=speakers').expect(200))).toEqual(['boom']);
      await get('/api/products?category=hidden').expect(404);
      await get('/api/products?category=nope').expect(404);
    });

    it('filters by brand, price (in rupees), stock and discount', async () => {
      expect(slugs(await get('/api/products?brand=aurora').expect(200)).sort()).toEqual([
        'boom',
        'pods',
      ]);
      expect(slugs(await get('/api/products?min=500&max=2000&sort=price_asc').expect(200))).toEqual(
        ['buds', 'pods'],
      );
      expect(slugs(await get('/api/products?inStock=1').expect(200))).not.toContain('buds');
      expect(slugs(await get('/api/products?discount=55').expect(200)).sort()).toEqual([
        'buds',
        'pods',
      ]);
    });

    it('sorts by price in both directions with stable pagination', async () => {
      expect(slugs(await get('/api/products?sort=price_asc').expect(200))).toEqual([
        'tee',
        'buds',
        'pods',
        'boom',
      ]);
      expect(slugs(await get('/api/products?sort=price_desc').expect(200))).toEqual([
        'boom',
        'pods',
        'buds',
        'tee',
      ]);
      const page2 = await get('/api/products?sort=price_asc&pageSize=3&page=2').expect(200);
      expect(slugs(page2)).toEqual(['boom']);
      expect(page2.body.meta).toMatchObject({ total: 4, totalPages: 2 });
    });

    it('returns facet counts that ignore their own filter', async () => {
      const res = await get('/api/products?category=audio&brand=aurora').expect(200);
      const { facets } = res.body.data;
      // Brand facet counts all audio brands so shoppers can widen the selection.
      expect(facets.brands).toEqual([
        { value: 'aurora', label: 'Aurora', count: 2 },
        { value: 'voltix', label: 'Voltix', count: 1 },
      ]);
      // Category facet: children of "audio" with subtree counts (brand filter applied).
      expect(facets.categories).toEqual([
        { value: 'earbuds', label: 'Earbuds', count: 1 },
        { value: 'speakers', label: 'Speakers', count: 1 },
      ]);
      expect(facets.priceRange).toEqual({ min: 199900, max: 279900 });
      expect(facets.inStockCount).toBe(2);
    });

    it('builds card data: cheapest price, badges, stock state and purchasable default variant', async () => {
      const items = (await get('/api/products').expect(200)).body.data.items;
      const pods = items.find((p: { slug: string }) => p.slug === 'pods');
      expect(pods).toMatchObject({
        price: 199900,
        mrp: 499900,
        maxDiscountPercent: 60,
        stock: 'in_stock',
        badges: ['DEAL', 'BESTSELLER'],
      });
      expect(pods.ratingCount).toBe(0); // no fabricated ratings
      const buds = items.find((p: { slug: string }) => p.slug === 'buds');
      expect(buds.stock).toBe('out_of_stock');
      const boom = items.find((p: { slug: string }) => p.slug === 'boom');
      expect(boom).toMatchObject({
        price: 279900,
        hasMultipleVariants: true,
        badges: ['DEAL', 'NEW'],
        stock: 'in_stock',
        available: 23,
      });
    });

    it('rejects invalid query parameters', async () => {
      await get('/api/products?sort=price;drop').expect(422);
      await get('/api/products?pageSize=1000').expect(422);
      await get('/api/products?brand=%3Cscript%3E').expect(422);
    });
  });

  describe('product detail', () => {
    it('returns variants with per-variant availability and option names', async () => {
      const res = await get('/api/products/boom').expect(200);
      const p = res.body.data;
      expect(p.breadcrumbs.map((c: { slug: string }) => c.slug)).toEqual([
        'electronics',
        'audio',
        'speakers',
      ]);
      expect(p.optionNames).toEqual(['Colour']);
      expect(
        p.variants.map((v: { options: object; available: number; stock: string }) => [
          v.options,
          v.available,
          v.stock,
        ]),
      ).toEqual([
        [{ Colour: 'Blue' }, 3, 'low_stock'],
        [{ Colour: 'Orange' }, 20, 'in_stock'],
      ]);
      expect(JSON.stringify(p)).not.toMatch(/costPrice|reserved|lowStockThreshold/);
    });

    it('hides drafts and products in inactive categories', async () => {
      await get('/api/products/draft').expect(404);
      await get('/api/products/secret').expect(404);
    });

    it('reflects stock reservations (trigger-maintained) after the cache expires', async () => {
      const v = await prisma.productVariant.findFirstOrThrow({
        where: { product: { slug: 'pods' } },
      });
      await prisma.inventory.update({ where: { variantId: v.id }, data: { reserved: 10 } });
      await app.get(CacheService).delByPrefix('catalog:');
      const res = await get('/api/products/pods').expect(200);
      expect(res.body.data.stock).toBe('out_of_stock');
    });

    it('returns related products from the same category', async () => {
      const res = await get('/api/products/pods/related').expect(200);
      expect(res.body.data.map((p: { slug: string }) => p.slug)).toEqual(['buds']);
    });
  });

  describe('brands and homepage', () => {
    it('lists active brands and resolves one by slug', async () => {
      const res = await get('/api/brands').expect(200);
      expect(res.body.data.map((b: { slug: string }) => b.slug)).toEqual(['aurora', 'voltix']);
      await get('/api/brands/aurora').expect(200);
      await get('/api/brands/missing').expect(404);
    });

    it('composes the homepage from active banners and non-empty admin sections', async () => {
      const audio = await prisma.category.findUniqueOrThrow({ where: { slug: 'audio' } });
      await prisma.banner.createMany({
        data: [
          { title: 'Live', placement: 'HOME_HERO', priority: 1 },
          {
            title: 'Expired',
            placement: 'HOME_HERO',
            endsAt: new Date(Date.now() - DAY),
            startsAt: new Date(Date.now() - 2 * DAY),
          },
          { title: 'Future', placement: 'HOME_HERO', startsAt: new Date(Date.now() + DAY) },
          { title: 'Promo', placement: 'HOME_PROMO', theme: 'ACCENT' },
        ],
      });
      await prisma.homeSection.createMany({
        data: [
          { title: 'Best sellers', source: 'BEST_SELLERS', position: 0 },
          { title: 'Audio', source: 'CATEGORY', categoryId: audio.id, position: 1 },
          { title: 'Featured', source: 'FEATURED', position: 2 }, // no featured products → hidden
        ],
      });
      const res = await get('/api/home').expect(200);
      const home = res.body.data;
      expect(home.heroBanners.map((b: { title: string }) => b.title)).toEqual(['Live']);
      expect(home.promoBanners[0]).toMatchObject({ title: 'Promo', theme: 'ACCENT' });
      expect(
        home.sections.map((s: { title: string; viewAllHref: string }) => [s.title, s.viewAllHref]),
      ).toEqual([
        ['Best sellers', '/best-sellers'],
        ['Audio', '/category/audio'],
      ]);
      // Best sellers exclude out-of-stock items.
      expect(home.sections[0].products.map((p: { slug: string }) => p.slug)).toEqual([
        'pods',
        'boom',
        'tee',
      ]);
      expect(home.featuredBrands.map((b: { slug: string }) => b.slug)).toEqual(['aurora']);
    });
  });

  describe('sitemap', () => {
    it('lists exactly what customers can see: live products, non-empty categories and brands, published pages', async () => {
      const hidden = await prisma.category.findUniqueOrThrow({ where: { slug: 'hidden' } });
      const child = await prisma.category.create({
        data: { slug: 'hidden-child', name: 'Child', parentId: hidden.id, depth: 1 },
      });
      await prisma.category.create({ data: { slug: 'empty', name: 'Empty' } });
      const lonely = await prisma.brand.create({ data: { slug: 'lonely', name: 'Lonely' } });
      await prisma.product.create({
        data: {
          slug: 'orphan',
          name: 'Orphan',
          sku: 'ORPHAN',
          categoryId: child.id,
          brandId: lonely.id,
          status: 'ACTIVE',
        },
      });
      await prisma.page.createMany({
        data: [
          { slug: 'about-us', title: 'About', content: 'x', isPublished: true },
          { slug: 'terms', title: 'Terms', content: 'x', isPublished: false },
        ],
      });

      const res = await get('/api/sitemap').expect(200);
      const d = res.body.data;
      const s = (xs: { slug: string }[]) => xs.map((x) => x.slug).sort();
      expect(s(d.products)).toEqual(['boom', 'buds', 'pods', 'tee']);
      expect(s(d.categories)).toEqual(['audio', 'earbuds', 'electronics', 'fashion', 'speakers']);
      expect(s(d.brands)).toEqual(['aurora', 'voltix']);
      expect(s(d.pages)).toEqual(['about-us']);
      const pods = d.products.find((p: { slug: string }) => p.slug === 'pods');
      expect(pods.images).toEqual(['/api/media/test/pods.webp']);
      expect(new Date(pods.updatedAt).toString()).not.toBe('Invalid Date');
    });
  });

  describe('media', () => {
    it('serves stored media immutably with a sandboxing CSP, and never escapes the media folder', async () => {
      const dir = join(app.get(StorageService).localDir, 'test');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'probe.webp'), Buffer.from('RIFF0000WEBP'));
      const res = await get('/api/media/test/probe.webp').expect(200);
      expect(res.headers['cache-control']).toMatch(/immutable/);
      expect(res.headers['content-security-policy']).toContain('sandbox');
      await get('/api/media/test/missing.webp').expect(404);
      await get('/api/media/..%2F..%2Fpackage.json').expect(404);
      await get('/api/media/%2e%2e/%2e%2e/package.json').expect(404);
    });
  });
});
