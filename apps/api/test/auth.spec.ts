import { Controller, Get, type INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { PERMISSIONS_KEY, RequirePermissions } from '../src/auth/decorators';
import { hashPassword } from '../src/common/security/password';
import { MessagingService } from '../src/messaging/messaging.service';
import { createTestApp } from './helpers/app';
import { browser, cookieNames, lastCode, messagesTo } from './helpers/client';
import { truncateAll } from './helpers/db';
import { TEST_DATABASE_URL } from './helpers/test-env';

@Controller('admin/probe')
@RequirePermissions('orders:read')
class AdminProbeController {
  @Get()
  ok() {
    return 'staff only';
  }
}

const prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
const PASSWORD = 'Tulsi-garden-42';

describe('authentication (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [AdminProbeController] });
  });
  beforeEach(async () => {
    await truncateAll(prisma);
    app.get(MessagingService).outbox.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function registered(email = 'asha@example.com', extra: object = {}) {
    const c = await browser(app);
    await c
      .post('/api/auth/register', { name: 'Asha Rao', email, password: PASSWORD, ...extra })
      .expect(201);
    return c;
  }

  describe('registration', () => {
    it('creates the account, sets hardened cookies and never returns secrets', async () => {
      const c = await browser(app);
      const res = await c
        .post('/api/auth/register', {
          name: 'Asha Rao',
          email: 'Asha@Example.com',
          password: PASSWORD,
          role: 'SUPER_ADMIN',
        })
        .expect(201);

      expect(res.body.data.user).toMatchObject({
        email: 'asha@example.com',
        role: 'CUSTOMER', // mass-assignment of role is impossible
        emailVerified: false,
        hasPassword: true,
        permissions: [],
      });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2|refresh/i);
      expect(res.body.data.tokens).toBeUndefined(); // browsers never see tokens

      const cookies = cookieNames(res);
      expect(cookies.sk_at).toMatch(/HttpOnly/i);
      expect(cookies.sk_at).toMatch(/SameSite=Lax/i);
      expect(cookies.sk_rt).toMatch(/HttpOnly/i);
      expect(cookies.sk_rt).toMatch(/Path=\/api\/auth/); // refresh token only travels to auth endpoints

      const me = await c.get('/api/auth/me').expect(200);
      expect(me.body.data.name).toBe('Asha Rao');

      const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('supports phone-only accounts', async () => {
      const c = await browser(app);
      const res = await c
        .post('/api/auth/register', { name: 'Ravi', phone: '+91 98765 43210', password: PASSWORD })
        .expect(201);
      expect(res.body.data.user).toMatchObject({ phone: '9876543210', email: null });
    });

    it('rejects duplicates and weak passwords', async () => {
      await registered();
      const c = await browser(app);
      const dup = await c
        .post('/api/auth/register', {
          name: 'Other',
          email: 'asha@example.com',
          password: PASSWORD,
        })
        .expect(409);
      expect(dup.body.error.code).toBe('EMAIL_TAKEN');
      const weak = await c
        .post('/api/auth/register', {
          name: 'Other',
          email: 'o@example.com',
          password: 'password123',
        })
        .expect(422);
      expect(weak.body.error.details[0].path).toBe('password');
    });
  });

  describe('CSRF protection', () => {
    it('does not let a browser with session cookies skip CSRF by claiming to be an app', async () => {
      const c = await registered();
      await c.agent.post('/api/auth/logout').set('x-client-type', 'app').expect(403);
      await c.get('/api/auth/me').expect(200);
    });

    it('rejects state-changing requests without a matching token', async () => {
      const c = await browser(app);
      const none = await c.agent
        .post('/api/auth/login')
        .send({ identifier: 'a@b.co', password: 'x' })
        .expect(403);
      expect(none.body.error.code).toBe('CSRF_FAILED');
      await c.agent
        .post('/api/auth/login')
        .set('x-csrf-token', 'forged-token-value-forged-token-value')
        .send({})
        .expect(403);
      // A fresh client with no cookie at all is also rejected.
      await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(403);
    });
  });

  describe('password login', () => {
    it('uses one generic message for unknown accounts and wrong passwords', async () => {
      await registered();
      const c = await browser(app);
      const wrong = await c
        .post('/api/auth/login', { identifier: 'asha@example.com', password: 'nope-nope-1' })
        .expect(401);
      const unknown = await c
        .post('/api/auth/login', { identifier: 'ghost@example.com', password: 'nope-nope-1' })
        .expect(401);
      expect(wrong.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(unknown.body.error.message).toBe(wrong.body.error.message);
    });

    it('logs in with email or mobile', async () => {
      await registered('asha@example.com', { phone: '9876543210' });
      const c = await browser(app);
      await c
        .post('/api/auth/login', { identifier: '98765 43210', password: PASSWORD })
        .expect(200);
      await c.get('/api/auth/me').expect(200);
    });

    it('locks the account after 5 failures, even for the right password', async () => {
      await registered();
      const c = await browser(app);
      for (let i = 0; i < 5; i++) {
        await c
          .post('/api/auth/login', { identifier: 'asha@example.com', password: `wrong-${i}-pass` })
          .expect(401);
      }
      const locked = await c
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(429);
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
      const audit = await prisma.auditLog.findFirst({ where: { action: 'user.locked_out' } });
      expect(audit).not.toBeNull();
    });

    it('blocks suspended accounts', async () => {
      const c = await registered();
      await prisma.user.update({
        where: { email: 'asha@example.com' },
        data: { status: 'SUSPENDED' },
      });
      const res = await (
        await browser(app)
      )
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
      // Existing sessions stop working once the cached session state expires or is invalidated.
      const { SessionService } = await import('../src/auth/session.service');
      const user = await prisma.user.findUniqueOrThrow({ where: { email: 'asha@example.com' } });
      await app.get(SessionService).invalidateUser(user.id);
      await c.get('/api/auth/me').expect(401);
    });
  });

  describe('one-time code (OTP) login', () => {
    it('logs in with an emailed code and marks the email verified', async () => {
      await registered();
      const c = await browser(app);
      const req = await c
        .post('/api/auth/otp/request', { identifier: 'asha@example.com' })
        .expect(202);
      const code = lastCode(app, 'asha@example.com');
      const res = await c
        .post('/api/auth/otp/verify', { identifier: 'asha@example.com', code })
        .expect(200);
      expect(res.body.data.user.emailVerified).toBe(true);
      expect(req.body.data.message).toMatch(/If an account exists/);
      // Codes are single-use.
      await c.post('/api/auth/otp/verify', { identifier: 'asha@example.com', code }).expect(401);
    });

    it('does not reveal whether an account exists and sends nothing for unknown ones', async () => {
      const c = await browser(app);
      const res = await c
        .post('/api/auth/otp/request', { identifier: 'ghost@example.com' })
        .expect(202);
      expect(res.body.data.message).toMatch(/If an account exists/);
      expect(messagesTo(app, 'ghost@example.com')).toHaveLength(0);
    });

    it('stores only a hash of the code', async () => {
      await registered();
      await (
        await browser(app)
      )
        .post('/api/auth/otp/request', { identifier: 'asha@example.com' })
        .expect(202);
      const code = lastCode(app, 'asha@example.com');
      const row = await prisma.otpCode.findFirstOrThrow({ where: { target: 'asha@example.com' } });
      expect(row.codeHash).not.toContain(code);
      expect(row.codeHash).toHaveLength(64);
    });

    it('locks a code after 5 wrong attempts', async () => {
      await registered();
      const c = await browser(app);
      await c.post('/api/auth/otp/request', { identifier: 'asha@example.com' }).expect(202);
      const code = lastCode(app, 'asha@example.com');
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++)
        await c
          .post('/api/auth/otp/verify', { identifier: 'asha@example.com', code: wrong })
          .expect(401);
      await c.post('/api/auth/otp/verify', { identifier: 'asha@example.com', code }).expect(401);
    });

    it('rate-limits code requests per recipient', async () => {
      await registered();
      const c = await browser(app);
      await c.post('/api/auth/otp/request', { identifier: 'asha@example.com' }).expect(202);
      const again = await c
        .post('/api/auth/otp/request', { identifier: 'asha@example.com' })
        .expect(429);
      expect(again.body.error.code).toBe('OTP_TOO_SOON');
    });

    it('delivers mobile codes by SMS', async () => {
      await registered('asha@example.com', { phone: '9876543210' });
      const c = await browser(app);
      await c.post('/api/auth/otp/request', { identifier: '9876543210' }).expect(202);
      const sms = messagesTo(app, '9876543210');
      expect(sms[0]).toMatchObject({ kind: 'sms' });
      expect(sms[0]!.text).toMatch(/Do not share/);
    });
  });

  describe('sessions and refresh tokens', () => {
    it('rotates the refresh token and detects reuse of an old one', async () => {
      const c = await registered();
      const stolen = (await prisma.session.findFirstOrThrow()).refreshTokenHash;
      expect(stolen).toHaveLength(64); // stored hashed

      // Capture the raw refresh cookie the browser holds.
      const loginRes = await c
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(200);
      const oldRefresh = /sk_rt=([^;]+)/.exec(
        ([] as string[]).concat(loginRes.headers['set-cookie']).join(';'),
      )![1]!;

      const refreshed = await c.post('/api/auth/refresh').expect(200);
      const newRefresh = /sk_rt=([^;]+)/.exec(
        ([] as string[]).concat(refreshed.headers['set-cookie']).join(';'),
      )![1]!;
      expect(newRefresh).not.toBe(oldRefresh);
      await c.get('/api/auth/me').expect(200);

      // An attacker replays the OLD token → rejected, and every session is revoked.
      const csrf = 'attacker-csrf-token-attacker-csrf-token';
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('x-csrf-token', csrf)
        .set('Cookie', `sk_rt=${oldRefresh}; sk_csrf=${csrf}`)
        .expect(401);
      await c.get('/api/auth/me').expect(401);
      await c.post('/api/auth/refresh').expect(401);
    });

    it('logout revokes the session immediately', async () => {
      const c = await registered();
      await c.post('/api/auth/logout').expect(200);
      await c.get('/api/auth/me').expect(401);
      const s = await prisma.session.findFirstOrThrow();
      expect(s.revokedAt).not.toBeNull();
    });

    it('rejects tampered and unsigned tokens', async () => {
      const c = await registered();
      const at = /sk_at=([^;]+)/.exec(
        ([] as string[])
          .concat(
            (
              await c.post('/api/auth/login', {
                identifier: 'asha@example.com',
                password: PASSWORD,
              })
            ).headers['set-cookie'],
          )
          .join(';'),
      )![1]!;
      const [header, payload] = at.split('.');
      const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
      const escalated = Buffer.from(JSON.stringify({ ...claims, role: 'SUPER_ADMIN' })).toString(
        'base64url',
      );
      const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const forgedSig = createHmac('sha256', 'guessed-secret')
        .update(`${header}.${escalated}`)
        .digest('base64url');

      for (const token of [
        `${header}.${escalated}.${at.split('.')[2]}`,
        `${none}.${escalated}.`,
        `${header}.${escalated}.${forgedSig}`,
      ]) {
        await request(app.getHttpServer())
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
    });
  });

  describe('native app clients', () => {
    it('receive tokens in the body, use Bearer auth, and need no CSRF token', async () => {
      await registered();
      const server = app.getHttpServer();
      const login = await request(server)
        .post('/api/auth/login')
        .set('x-client-type', 'app')
        .send({ identifier: 'asha@example.com', password: PASSWORD })
        .expect(200);
      const { accessToken, refreshToken } = login.body.data.tokens;
      const setCookies = ([] as string[]).concat(login.headers['set-cookie'] ?? []);
      expect(setCookies.some((c) => c.startsWith('sk_at') || c.startsWith('sk_rt'))).toBe(false);

      await request(server)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const refreshed = await request(server)
        .post('/api/auth/refresh')
        .set('x-client-type', 'app')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);
      expect(refreshed.body.data.tokens.refreshToken).not.toBe(refreshToken);
    });
  });

  describe('password reset', () => {
    it('resets with a code, signs out everywhere and notifies by email', async () => {
      const original = await registered();
      const c = await browser(app);
      await c.post('/api/auth/password/forgot', { identifier: 'asha@example.com' }).expect(202);
      const code = lastCode(app, 'asha@example.com');
      await c
        .post('/api/auth/password/reset', {
          identifier: 'asha@example.com',
          code,
          password: 'New-mango-tree-7',
        })
        .expect(200);

      await original.get('/api/auth/me').expect(401);
      await c
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(401);
      await c
        .post('/api/auth/login', { identifier: 'asha@example.com', password: 'New-mango-tree-7' })
        .expect(200);
      expect(
        messagesTo(app, 'asha@example.com').map((m) => (m as { subject?: string }).subject),
      ).toContain('Your SeShaKart password was changed');
    });

    it('rejects a wrong code without changing the password', async () => {
      await registered();
      const c = await browser(app);
      await c.post('/api/auth/password/forgot', { identifier: 'asha@example.com' }).expect(202);
      await c
        .post('/api/auth/password/reset', {
          identifier: 'asha@example.com',
          code: '999999',
          password: 'New-mango-tree-7',
        })
        .expect(401);
      await c
        .post('/api/auth/login', { identifier: 'asha@example.com', password: PASSWORD })
        .expect(200);
    });
  });

  describe('role-based access control', () => {
    it('denies anonymous and customer access to staff routes and allows permitted staff', async () => {
      await request(app.getHttpServer()).get('/api/admin/probe').expect(401);

      const customer = await registered();
      const denied = await customer.get('/api/admin/probe').expect(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');

      await prisma.user.create({
        data: {
          name: 'Support',
          email: 'support@seshakart.com',
          role: 'CUSTOMER_SUPPORT',
          passwordHash: await hashPassword(PASSWORD),
        },
      });
      const staff = await browser(app);
      await staff
        .post('/api/auth/login', { identifier: 'support@seshakart.com', password: PASSWORD })
        .expect(200);
      await staff.get('/api/admin/probe').expect(200);
    });

    it('applies role changes to existing sessions without re-login', async () => {
      const c = await registered();
      const user = await prisma.user.update({
        where: { email: 'asha@example.com' },
        data: { role: 'MANAGER' },
      });
      const { SessionService } = await import('../src/auth/session.service');
      await app.get(SessionService).invalidateUser(user.id);
      await c.get('/api/admin/probe').expect(200);
    });

    it('every /admin controller in the application declares required permissions', () => {
      const offenders: string[] = [];
      for (const mod of app.get(ModulesContainer).values()) {
        for (const { metatype } of mod.controllers.values()) {
          if (!metatype) continue;
          const path = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '');
          if (!path.replace(/^\//, '').startsWith('admin')) continue;
          const classPerms = Reflect.getMetadata(PERMISSIONS_KEY, metatype);
          const proto = metatype.prototype as Record<string, object>;
          const handlers = Object.getOwnPropertyNames(proto).filter((n) => n !== 'constructor');
          const unguarded = handlers.filter(
            (h) => !classPerms && !Reflect.getMetadata(PERMISSIONS_KEY, proto[h]!),
          );
          if (unguarded.length) offenders.push(`${metatype.name}: ${unguarded.join(', ')}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  });
});

describe('session renewal on page navigation (integration)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => truncateAll(prisma));
  afterAll(async () => {
    await app.close();
  });

  it('renews an expired access token and redirects back to a same-site path only', async () => {
    const c = await browser(app);
    const reg = await c
      .post('/api/auth/register', { name: 'Asha', email: 'asha@example.com', password: PASSWORD })
      .expect(201);
    expect(
      ([] as string[]).concat(reg.headers['set-cookie']).some((x) => x.startsWith('sk_sess=1')),
    ).toBe(true);

    const ok = await c.get('/api/auth/session/renew?next=%2Faccount%2Fprofile').expect(303);
    expect(ok.headers.location).toBe('/account/profile');
    expect(
      ([] as string[]).concat(ok.headers['set-cookie']).some((x) => x.startsWith('sk_at=')),
    ).toBe(true);

    for (const evil of ['https://evil.example', '//evil.example', '/\\\\evil.example']) {
      const res = await c
        .get(`/api/auth/session/renew?next=${encodeURIComponent(evil)}`)
        .expect(303);
      expect(res.headers.location).toBe('/');
    }
  });

  it('sends users without a valid session to login, clearing stale cookies', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/session/renew?next=%2Faccount')
      .set('Cookie', 'sk_rt=not-a-real-token-not-a-real-token; sk_sess=1')
      .expect(303);
    expect(res.headers.location).toBe('/login?next=%2Faccount');
    expect(
      ([] as string[]).concat(res.headers['set-cookie']).some((x) => x.startsWith('sk_sess=;')),
    ).toBe(true);
  });

  it('exposes only non-sensitive public settings', async () => {
    const res = await request(app.getHttpServer()).get('/api/settings/public').expect(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      [
        'codEnabled',
        'freeShippingThreshold',
        'legalName',
        'storeName',
        'supportEmail',
        'supportPhone',
        'tagline',
      ].sort(),
    );
  });
});
