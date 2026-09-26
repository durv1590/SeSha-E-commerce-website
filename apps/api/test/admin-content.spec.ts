import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import type { BrowserClient } from './helpers/client';
import { truncateAll } from './helpers/db';
import { staffClient } from './helpers/staff';
import { TEST_DATABASE_URL } from './helpers/test-env';

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });

describe('content and settings admin (integration)', () => {
  let app: INestApplication;
  let admin: BrowserClient;
  const pub = () => request(app.getHttpServer());

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

  describe('banners', () => {
    const banner = (over: Record<string, unknown> = {}) => ({
      title: 'Festive sale',
      subtitle: 'Up to 50% off',
      ctaLabel: 'Shop now',
      link: '/deals',
      placement: 'HOME_HERO',
      ...over,
    });

    it('validates links, buttons and image descriptions', async () => {
      const r = await admin
        .post(
          '/api/admin/banners',
          banner({ link: 'javascript:alert(1)', imageDesktop: '/api/media/uploads/a.webp' }),
        )
        .expect(422);
      expect(r.body.error.details.map((d: { path: string }) => d.path)).toEqual(['link']);
      // Cross-field rules run once every field is valid.
      const alt = await admin
        .post('/api/admin/banners', banner({ imageDesktop: '/api/media/uploads/a.webp' }))
        .expect(422);
      expect(alt.body.error.details.map((d: { path: string }) => d.path)).toEqual(['imageAlt']);
      await admin.post('/api/admin/banners', banner({ link: '' })).expect(422); // button without a link
      await admin.post('/api/admin/banners', banner({ link: '//evil.example' })).expect(422);
    });

    it('publishes to the homepage at once, respecting the schedule', async () => {
      await pub().get('/api/home').expect(200); // warm the cache
      const live = (await admin.post('/api/admin/banners', banner()).expect(201)).body.data;
      expect(live.state).toBe('live');
      const soon = (
        await admin
          .post(
            '/api/admin/banners',
            banner({
              title: 'Coming soon',
              startsAt: new Date(Date.now() + 86_400_000).toISOString(),
            }),
          )
          .expect(201)
      ).body.data;
      expect(soon.state).toBe('scheduled');
      const home = (await pub().get('/api/home').expect(200)).body.data;
      expect(home.heroBanners.map((b: { title: string }) => b.title)).toEqual(['Festive sale']);

      await admin.put(`/api/admin/banners/${live.id}`, banner({ isActive: false })).expect(200);
      expect((await pub().get('/api/home').expect(200)).body.data.heroBanners).toEqual([]);
      await admin.delete(`/api/admin/banners/${soon.id}`).expect(204);
      expect((await admin.get('/api/admin/banners').expect(200)).body.data).toHaveLength(1);
      expect(await prisma.auditLog.count({ where: { action: { startsWith: 'banner.' } } })).toBe(4);
    });

    it('is for staff who manage content', async () => {
      await (
        await staffClient(app, prisma, 'MANAGER')
      )
        .post('/api/admin/banners', banner())
        .expect(201);
      await (
        await staffClient(app, prisma, 'CUSTOMER_SUPPORT')
      )
        .get('/api/admin/banners')
        .expect(403);
    });
  });

  describe('homepage sections', () => {
    it('creates, reorders (whole list only) and deletes sections', async () => {
      const cat = await prisma.category.create({ data: { name: 'Audio', slug: 'audio' } });
      expect(
        (
          await admin
            .post('/api/admin/home-sections', { title: 'Audio picks', source: 'CATEGORY' })
            .expect(422)
        ).body.error.details[0].path,
      ).toBe('categoryId');
      await admin
        .post('/api/admin/home-sections', { title: 'Best sellers', source: 'BEST_SELLERS' })
        .expect(201);
      const list = (
        await admin
          .post('/api/admin/home-sections', {
            title: 'Audio picks',
            source: 'CATEGORY',
            categoryId: cat.id,
          })
          .expect(201)
      ).body.data;
      expect(list.map((s: { title: string; position: number }) => [s.title, s.position])).toEqual([
        ['Best sellers', 0],
        ['Audio picks', 1],
      ]);
      expect(list[1].categoryName).toBe('Audio');
      const ids = list.map((s: { id: string }) => s.id);
      expect(
        (await admin.put('/api/admin/home-sections/order', { ids: [ids[0]] }).expect(409)).body
          .error.code,
      ).toBe('STALE_ORDER');
      const reordered = (
        await admin.put('/api/admin/home-sections/order', { ids: [ids[1], ids[0]] }).expect(200)
      ).body.data;
      expect(reordered.map((s: { title: string }) => s.title)).toEqual([
        'Audio picks',
        'Best sellers',
      ]);
      // Switching away from CATEGORY clears the category.
      const edited = (
        await admin
          .put(`/api/admin/home-sections/${ids[1]}`, {
            title: 'New in',
            source: 'NEW_ARRIVALS',
            categoryId: cat.id,
          })
          .expect(200)
      ).body.data;
      expect(edited.find((s: { id: string }) => s.id === ids[1]).categoryId).toBeNull();
      expect(
        (await admin.delete(`/api/admin/home-sections/${ids[0]}`).expect(200)).body.data,
      ).toHaveLength(1);
    });
  });

  describe('pages', () => {
    it('keeps drafts private, publishes, and refreshes the public copy on edit', async () => {
      const draft = (
        await admin
          .post('/api/admin/pages', {
            title: 'Shipping policy',
            content: '## Delivery\nWe ship fast.',
          })
          .expect(201)
      ).body.data;
      expect(draft).toMatchObject({
        slug: 'shipping-policy',
        isPublished: false,
        updatedBy: 'ADMIN',
      });
      await pub().get('/api/pages/shipping-policy').expect(404);
      expect((await pub().get('/api/pages').expect(200)).body.data).toEqual([]);

      await admin.put(`/api/admin/pages/${draft.id}`, { ...draft, isPublished: true }).expect(200);
      expect((await pub().get('/api/pages/shipping-policy').expect(200)).body.data.content).toBe(
        '## Delivery\nWe ship fast.',
      );
      await admin
        .put(`/api/admin/pages/${draft.id}`, { ...draft, isPublished: true, content: 'Updated.' })
        .expect(200);
      expect((await pub().get('/api/pages/shipping-policy').expect(200)).body.data.content).toBe(
        'Updated.',
      );
      expect((await pub().get('/api/pages').expect(200)).body.data).toEqual([
        { slug: 'shipping-policy', title: 'Shipping policy' },
      ]);

      const second = (
        await admin.post('/api/admin/pages', { title: 'Shipping policy' }).expect(201)
      ).body.data;
      expect(second.slug).toBe('shipping-policy-2');
      expect(
        (
          await admin
            .put(`/api/admin/pages/${second.id}`, {
              title: 'Another page',
              slug: 'shipping-policy',
            })
            .expect(409)
        ).body.error.code,
      ).toBe('SLUG_TAKEN');
      await admin.delete(`/api/admin/pages/${second.id}`).expect(204);
    });
  });

  describe('SEO overrides', () => {
    it('validates paths, refuses duplicates and serves overrides publicly', async () => {
      await admin.post('/api/admin/seo', { path: '/admin', title: 'x' }).expect(422);
      await admin.post('/api/admin/seo', { path: 'deals', title: 'x' }).expect(422);
      expect(
        (await admin.post('/api/admin/seo', { path: '/deals' }).expect(422)).body.error.details[0]
          .path,
      ).toBe('title');
      await pub().get('/api/seo-overrides').expect(200); // warm the cache
      const s = (
        await admin
          .post('/api/admin/seo', {
            path: '/deals',
            title: 'Today’s deals',
            description: 'Big savings every day.',
          })
          .expect(201)
      ).body.data;
      expect(
        (await admin.post('/api/admin/seo', { path: '/deals', noindex: true }).expect(409)).body
          .error.code,
      ).toBe('SEO_PATH_EXISTS');
      expect((await pub().get('/api/seo-overrides').expect(200)).body.data).toEqual([
        {
          path: '/deals',
          title: 'Today’s deals',
          description: 'Big savings every day.',
          ogImage: null,
          noindex: false,
        },
      ]);
      await admin.delete(`/api/admin/seo/${s.id}`).expect(204);
      expect((await pub().get('/api/seo-overrides').expect(200)).body.data).toEqual([]);
      await (await staffClient(app, prisma, 'CUSTOMER_SUPPORT')).get('/api/admin/seo').expect(403);
    });
  });

  describe('settings', () => {
    it('reads and replaces settings groups with full validation', async () => {
      const store = (await admin.get('/api/admin/settings/store').expect(200)).body.data;
      expect(store.name).toBe('SeShaKart');
      await admin.get('/api/admin/settings/secrets').expect(422);

      const bad = await admin
        .put('/api/admin/settings/store', { ...store, gstin: 'NOT-A-GSTIN' })
        .expect(422);
      expect(bad.body.error.details[0].path).toBe('gstin');
      await admin
        .put('/api/admin/settings/store', {
          ...store,
          tagline: 'Shop smarter',
          gstin: '27AAACS1234A1Z5',
          registeredState: 'Maharashtra',
        })
        .expect(200);
      expect((await pub().get('/api/settings/public').expect(200)).body.data.tagline).toBe(
        'Shop smarter',
      );

      const commerce = (await admin.get('/api/admin/settings/commerce').expect(200)).body.data;
      const saved = (
        await admin.put('/api/admin/settings/commerce', { ...commerce, codFee: 2_900 }).expect(200)
      ).body.data;
      expect(saved.codFee).toBe(2_900);
      const shipping = (await admin.get('/api/admin/settings/shipping').expect(200)).body.data;
      await admin
        .put('/api/admin/settings/shipping', { ...shipping, standardDays: { min: 5, max: 2 } })
        .expect(422);
      expect(await prisma.auditLog.count({ where: { action: 'settings.updated' } })).toBe(2);

      await (
        await staffClient(app, prisma, 'MANAGER')
      )
        .get('/api/admin/settings/store')
        .expect(403);
    });
  });
});
