import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { CacheService } from '../src/cache/cache.service';
import { SearchService } from '../src/search/search.service';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

/**
 * Fixture:
 *   audio   : Aurora Pulse Wireless Earbuds (Aurora, sold 500), Voltix Bass Earbuds (Voltix, out of stock),
 *             Aurora Boom Bluetooth Speaker
 *   fashion : Classic Cotton T-Shirt (Voltix)
 *   phones  : Nova 5G Smartphone (Voltix)
 *   hidden (inactive) : Secret Earbuds — never found
 *   draft Earbuds Prototype — never found
 */
async function fixture() {
  const cat = (slug: string, name: string, isActive = true) =>
    prisma.category.create({ data: { slug, name, isActive } });
  const audio = await cat('audio', 'Audio');
  const fashion = await cat('fashion', 'Fashion');
  const phones = await cat('phones', 'Mobile Phones');
  const hidden = await cat('hidden', 'Hidden', false);
  const aurora = await prisma.brand.create({ data: { slug: 'aurora', name: 'Aurora' } });
  const voltix = await prisma.brand.create({ data: { slug: 'voltix', name: 'Voltix' } });

  let n = 0;
  const product = (
    name: string,
    categoryId: string,
    brandId: string,
    price: number,
    stock: number,
    extra: object = {},
  ) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return prisma.product.create({
      data: {
        slug,
        name,
        sku: `SKU-${++n}`,
        categoryId,
        brandId,
        status: 'ACTIVE',
        publishedAt: new Date(),
        variants: {
          create: [
            {
              sku: `SKU-${n}-0`,
              name: 'Default',
              mrp: price * 200,
              price: price * 100,
              isDefault: true,
              inventory: { create: { stock } },
            },
          ],
        },
        ...extra,
      },
    });
  };

  await product('Aurora Pulse Wireless Earbuds', audio.id, aurora.id, 1999, 10, {
    soldCount: 500,
    tags: ['tws', 'bluetooth'],
    shortDescription: 'True wireless earbuds with 30 hour battery',
  });
  await product('Voltix Bass Earbuds', audio.id, voltix.id, 999, 0, { soldCount: 50 });
  await product('Aurora Boom Bluetooth Speaker', audio.id, aurora.id, 2799, 5, {
    tags: ['portable'],
  });
  await product('Classic Cotton T-Shirt', fashion.id, voltix.id, 399, 50);
  await product('Nova 5G Smartphone', phones.id, voltix.id, 14999, 5);
  await product('Secret Earbuds', hidden.id, voltix.id, 100, 5);
  await product('Earbuds Prototype', audio.id, aurora.id, 100, 5, { status: 'DRAFT' });
}

describe('search API (integration)', () => {
  let app: INestApplication;
  const get = (path: string) => request(app.getHttpServer()).get(path);
  const names = (res: request.Response) => res.body.data.items.map((p: { name: string }) => p.name);
  const search = (q: string, extra = '') =>
    get(`/api/products?q=${encodeURIComponent(q)}${extra}`).expect(200);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    await app.get(CacheService).delByPrefix('catalog:');
    await app.get(CacheService).delByPrefix('settings:');
    await fixture();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('product search', () => {
    it('ranks relevant, popular, in-stock products first and hides inactive/draft products', async () => {
      const res = await search('earbuds');
      expect(names(res)).toEqual(['Aurora Pulse Wireless Earbuds', 'Voltix Bass Earbuds']);
      expect(res.body.data.query).toBe('earbuds');
      expect(res.body.data.correctedQuery).toBeNull();
      expect(res.body.meta.total).toBe(2);
    });

    it('matches word prefixes, descriptions and tags', async () => {
      expect(names(await search('ear'))).toHaveLength(2);
      expect(names(await search('portable'))).toEqual(['Aurora Boom Bluetooth Speaker']);
      expect(names(await search('battery'))).toEqual(['Aurora Pulse Wireless Earbuds']);
    });

    it('requires every word to match', async () => {
      expect(names(await search('wireless earbuds'))).toEqual(['Aurora Pulse Wireless Earbuds']);
      // Both are real catalogue words, just never together: no misleading partial matches.
      expect(names(await search('bass speaker'))).toEqual([]);
    });

    it('falls back to close product names when a word is unknown', async () => {
      const res = await search('smartfone nova');
      expect(names(res)).toEqual(['Nova 5G Smartphone']);
    });

    it('expands everyday synonyms', async () => {
      expect(names(await search('tshirt'))).toEqual(['Classic Cotton T-Shirt']);
      expect(names(await search('mobile'))).toEqual(['Nova 5G Smartphone']);
    });

    it('treats a brand name as a brand constraint', async () => {
      expect(names(await search('aurora'))).toEqual(
        expect.arrayContaining(['Aurora Pulse Wireless Earbuds', 'Aurora Boom Bluetooth Speaker']),
      );
      expect(names(await search('voltix earbuds'))).toEqual(['Voltix Bass Earbuds']);
    });

    it('corrects typos and reports the corrected query', async () => {
      const res = await search('earbds');
      expect(names(res)).toContain('Aurora Pulse Wireless Earbuds');
      expect(res.body.data.correctedQuery).toBe('earbuds');
    });

    it('learns new catalogue words once the catalogue changes (vocabulary refresh)', async () => {
      expect(names(await search('kettel'))).toEqual([]); // vocabulary built without it
      const audio = await prisma.category.findUniqueOrThrow({ where: { slug: 'audio' } });
      await prisma.product.create({
        data: {
          slug: 'rasoi-steel-kettle',
          name: 'Rasoi Steel Kettle',
          sku: 'SKU-KETTLE',
          categoryId: audio.id,
          status: 'ACTIVE',
          variants: {
            create: [{ sku: 'SKU-KETTLE-0', name: 'Default', mrp: 200_000, price: 150_000 }],
          },
        },
      });
      // Any catalogue edit clears the catalogue cache (RevalidationService.catalogChanged).
      await app.get(CacheService).delByPrefix('catalog:');
      const res = await search('kettel');
      expect(names(res)).toEqual(['Rasoi Steel Kettle']);
      expect(res.body.data.correctedQuery).toBe('kettle');
    });

    it('combines search with filters and facets', async () => {
      const res = await search('earbuds', '&inStock=true');
      expect(names(res)).toEqual(['Aurora Pulse Wireless Earbuds']);
      // Facets reflect the search and the other filters (only Aurora is in stock).
      expect(res.body.data.facets.brands).toEqual([{ value: 'aurora', label: 'Aurora', count: 1 }]);
      const all = await search('earbuds');
      expect(all.body.data.facets.categories).toEqual([
        { value: 'audio', label: 'Audio', count: 2 },
      ]);
      expect(names(await search('earbuds', '&sort=price_asc'))).toEqual([
        'Voltix Bass Earbuds',
        'Aurora Pulse Wireless Earbuds',
      ]);
    });

    it('returns an empty result for nonsense and treats SQL/tsquery syntax as plain text', async () => {
      expect(names(await search('zzqxv'))).toEqual([]);
      for (const q of ["'; DROP TABLE products; --", 'ear & | ! :* ( )', '%_\\']) {
        await search(q);
      }
      expect(await prisma.product.count()).toBe(7);
    });

    it('rejects over-long queries', async () => {
      await get(`/api/products?q=${'a'.repeat(101)}`).expect(422);
    });
  });

  describe('search analytics', () => {
    it('records normalised queries anonymously on the first page only, never personal data', async () => {
      await search('  EarBuds ');
      await search('earbuds', '&page=2');
      await search('earbuds');
      await search('call me on 98765 43210');
      await search('someone@example.com');
      await new Promise((r) => setTimeout(r, 100)); // recording is fire-and-forget
      const rows = await prisma.searchQuery.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ query: 'earbuds', count: 2, lastResultCount: 2 });
    });

    it('lists popular searches above the threshold (with results) plus admin trending terms', async () => {
      await prisma.searchQuery.createMany({
        data: [
          { query: 'earbuds', count: 9, lastResultCount: 2 },
          { query: 'earphones', count: 2, lastResultCount: 2 },
          { query: 'zzqxv', count: 50, lastResultCount: 0 },
        ],
      });
      await prisma.setting.create({
        data: { key: 'search', value: { trending: ['diwali lights'], popularMinCount: 5 } },
      });
      const res = await get('/api/search/popular').expect(200);
      expect(res.body.data).toEqual({ trending: ['diwali lights'], popular: ['earbuds'] });
    });
  });

  describe('suggestions', () => {
    it('suggests products, categories, brands and popular completions', async () => {
      await prisma.searchQuery.create({
        data: { query: 'aurora pulse', count: 10, lastResultCount: 1 },
      });
      const res = await get('/api/search/suggest?q=Auro').expect(200);
      const d = res.body.data;
      expect(d.query).toBe('auro');
      expect(d.products.map((p: { name: string }) => p.name)).toEqual(
        expect.arrayContaining(['Aurora Pulse Wireless Earbuds', 'Aurora Boom Bluetooth Speaker']),
      );
      expect(d.products[0]).toEqual(
        expect.objectContaining({ slug: expect.any(String), price: expect.any(Number) }),
      );
      expect(d.brands).toEqual([expect.objectContaining({ slug: 'aurora', name: 'Aurora' })]);
      expect(d.queries).toEqual(['aurora pulse']);
      expect(res.headers['cache-control']).toContain('max-age=60');

      const cats = await get('/api/search/suggest?q=mob').expect(200);
      expect(cats.body.data.categories).toEqual([expect.objectContaining({ slug: 'phones' })]);
    });

    it('returns empty suggestions for an empty query and never records suggestions', async () => {
      const res = await get('/api/search/suggest?q=').expect(200);
      expect(res.body.data).toEqual({
        query: '',
        products: [],
        categories: [],
        brands: [],
        queries: [],
      });
      await get('/api/search/suggest?q=earbuds').expect(200);
      expect(await prisma.searchQuery.count()).toBe(0);
    });
  });

  it('exposes the engine behind an interface (ids + corrected query)', async () => {
    const result = await app.get(SearchService).search('speaker');
    expect(result.ids).toHaveLength(1);
    expect(result.correctedQuery).toBeNull();
  });
});
