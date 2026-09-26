import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { MessagingService } from '../src/messaging/messaging.service';
import { createTestApp } from './helpers/app';
import { browser, lastCode, type BrowserClient } from './helpers/client';
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

describe('customer account (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    app.get(MessagingService).outbox.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function signUp(email: string, extra: object = {}): Promise<BrowserClient> {
    const c = await browser(app);
    await c
      .post('/api/auth/register', { name: 'Asha Rao', email, password: PASSWORD, ...extra })
      .expect(201);
    return c;
  }

  it('requires sign-in for every account endpoint', async () => {
    const server = app.getHttpServer();
    for (const path of [
      '/api/users/me',
      '/api/users/me/addresses',
      '/api/users/me/sessions',
      '/api/users/me/notifications',
    ]) {
      const res = await request(server).get(path).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  describe('profile', () => {
    it('updates the profile and requires re-verification when the email changes', async () => {
      const c = await signUp('asha@example.com');
      await prisma.user.update({
        where: { email: 'asha@example.com' },
        data: { emailVerifiedAt: new Date() },
      });
      const res = await c
        .patch('/api/users/me', {
          name: 'Asha R.',
          email: 'asha.rao@example.com',
          marketingOptIn: true,
        })
        .expect(200);
      expect(res.body.data).toMatchObject({
        name: 'Asha R.',
        email: 'asha.rao@example.com',
        emailVerified: false,
        marketingOptIn: true,
      });
    });

    it('refuses an email that belongs to another account, and removing the last contact', async () => {
      await signUp('other@example.com');
      const c = await signUp('asha@example.com');
      const taken = await c.patch('/api/users/me', { email: 'other@example.com' }).expect(409);
      expect(taken.body.error.code).toBe('CONTACT_TAKEN');
      const none = await c.patch('/api/users/me', { email: '' }).expect(422);
      expect(none.body.error.code).toBe('CONTACT_REQUIRED');
    });

    it('cannot escalate its own role', async () => {
      const c = await signUp('asha@example.com');
      await c.patch('/api/users/me', { name: 'Asha', role: 'SUPER_ADMIN' }).expect(200);
      const me = await c.get('/api/auth/me').expect(200);
      expect(me.body.data.role).toBe('CUSTOMER');
    });

    it('verifies an email with a code', async () => {
      const c = await signUp('asha@example.com');
      await c.post('/api/users/me/verify/request', { channel: 'EMAIL' }).expect(202);
      const bad = await c.post('/api/users/me/verify/confirm', {
        channel: 'EMAIL',
        code: '000000',
      });
      if (bad.status === 200) throw new Error('guessed code accepted'); // (1 in a million)
      const code = lastCode(app, 'asha@example.com');
      const ok = await c
        .post('/api/users/me/verify/confirm', { channel: 'EMAIL', code })
        .expect(200);
      expect(ok.body.data.emailVerified).toBe(true);
    });
  });

  describe('password and sessions', () => {
    it('changes the password, keeps this device and signs out the others', async () => {
      const laptop = await signUp('asha@example.com');
      const phone = await browser(app);
      await phone
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(200);

      const wrong = await laptop
        .post('/api/users/me/password', {
          currentPassword: 'not-it-1',
          newPassword: 'New-mango-tree-7',
        })
        .expect(422);
      expect(wrong.body.error.details[0].path).toBe('currentPassword');

      await laptop
        .post('/api/users/me/password', {
          currentPassword: PASSWORD,
          newPassword: 'New-mango-tree-7',
        })
        .expect(200);
      await laptop.get('/api/auth/me').expect(200);
      await phone.get('/api/auth/me').expect(401);
      expect(await prisma.auditLog.count({ where: { action: 'user.password_changed' } })).toBe(1);
    });

    it('lists sessions and revokes another device, but never another user’s session', async () => {
      const laptop = await signUp('asha@example.com');
      const phone = await browser(app);
      await phone
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(200);
      const intruder = await signUp('intruder@example.com');

      const list = await laptop.get('/api/users/me/sessions').expect(200);
      expect(list.body.data).toHaveLength(2);
      const other = list.body.data.find((s: { current: boolean }) => !s.current);

      await intruder.delete(`/api/users/me/sessions/${other.id}`).expect(404); // IDOR attempt
      await phone.get('/api/auth/me').expect(200);

      await laptop.delete(`/api/users/me/sessions/${other.id}`).expect(204);
      await phone.get('/api/auth/me').expect(401);
    });
  });

  describe('addresses', () => {
    it('makes the first address the default and moves the default atomically', async () => {
      const c = await signUp('asha@example.com');
      const first = await c.post('/api/users/me/addresses', ADDRESS).expect(201);
      expect(first.body.data.isDefault).toBe(true);
      const second = await c
        .post('/api/users/me/addresses', { ...ADDRESS, label: 'WORK', isDefault: true })
        .expect(201);
      const list = await c.get('/api/users/me/addresses').expect(200);
      expect(
        list.body.data.map((a: { id: string; isDefault: boolean }) => [a.id, a.isDefault]),
      ).toEqual([
        [second.body.data.id, true],
        [first.body.data.id, false],
      ]);
    });

    it('reassigns the default when the default address is deleted', async () => {
      const c = await signUp('asha@example.com');
      const a = await c.post('/api/users/me/addresses', ADDRESS).expect(201);
      const b = await c
        .post('/api/users/me/addresses', { ...ADDRESS, line1: '5 FC Road' })
        .expect(201);
      await c.delete(`/api/users/me/addresses/${a.body.data.id}`).expect(204);
      const list = await c.get('/api/users/me/addresses').expect(200);
      expect(list.body.data).toEqual([
        expect.objectContaining({ id: b.body.data.id, isDefault: true }),
      ]);
    });

    it('validates Indian address fields', async () => {
      const c = await signUp('asha@example.com');
      const res = await c
        .post('/api/users/me/addresses', { ...ADDRESS, pincode: '01234', phone: '12345' })
        .expect(422);
      expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'phone',
        'pincode',
      ]);
    });

    it('prevents reading, editing or deleting another customer’s address (IDOR)', async () => {
      const owner = await signUp('asha@example.com');
      const addr = await owner.post('/api/users/me/addresses', ADDRESS).expect(201);
      const id = addr.body.data.id;
      const intruder = await signUp('intruder@example.com');

      const list = await intruder.get('/api/users/me/addresses').expect(200);
      expect(list.body.data).toEqual([]);
      await intruder.patch(`/api/users/me/addresses/${id}`, { city: 'Hacked' }).expect(404);
      await intruder.delete(`/api/users/me/addresses/${id}`).expect(404);

      const stillThere = await prisma.address.findUniqueOrThrow({ where: { id } });
      expect(stillThere.city).toBe('Pune');
    });

    it('limits the number of saved addresses', async () => {
      const c = await signUp('asha@example.com');
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
      await prisma.address.createMany({
        data: Array.from({ length: 20 }, () => ({ ...ADDRESS, userId: user.id })),
      });
      const res = await c.post('/api/users/me/addresses', ADDRESS).expect(422);
      expect(res.body.error.code).toBe('ADDRESS_LIMIT');
    });
  });

  describe('notifications', () => {
    it('paginates, counts unread and marks as read — only the owner’s', async () => {
      const c = await signUp('asha@example.com');
      const other = await signUp('other@example.com');
      const [asha, otherUser] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } }),
        prisma.user.findUniqueOrThrow({ where: { email: 'other@example.com' } }),
      ]);
      await prisma.notification.createMany({
        data: Array.from({ length: 3 }, (_, i) => ({
          userId: asha.id,
          type: 'order',
          title: `Order update ${i}`,
          body: 'Shipped',
        })),
      });
      const foreign = await prisma.notification.create({
        data: { userId: otherUser.id, type: 'order', title: 'Theirs', body: 'x' },
      });

      const page = await c.get('/api/users/me/notifications?page=1&pageSize=2').expect(200);
      expect(page.body.data).toHaveLength(2);
      expect(page.body.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(page.body.unread).toBe(3);

      const cross = await c.post(`/api/users/me/notifications/${foreign.id}/read`).expect(200);
      expect(cross.body.data.updated).toBe(0);

      await c.post('/api/users/me/notifications/read').expect(200);
      const after = await c.get('/api/users/me/notifications').expect(200);
      expect(after.body.unread).toBe(0);
      const theirs = await other.get('/api/users/me/notifications').expect(200);
      expect(theirs.body.unread).toBe(1);
    });
  });
});
