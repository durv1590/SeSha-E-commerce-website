import { Controller, Get, type INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { TEST_REDIS_URL } from './helpers/test-env';

@Controller('probe')
class ProbeController {
  @Get()
  ping() {
    return 'pong';
  }
}

// NOTE: Nest guards (including the throttler) only run for matched routes. Floods
// against unknown URLs are absorbed by the edge (Cloudflare rate limiting / WAF),
// documented in SECURITY.md.
async function hammer(app: INestApplication, times: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < times; i++) {
    statuses.push((await request(app.getHttpServer()).get('/api/probe')).status);
  }
  return statuses;
}

describe('rate limiting (integration)', () => {
  it('returns 429 with the standard error envelope after the limit (in-memory store)', async () => {
    const app = await createTestApp({
      env: { RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW_SECONDS: '60', RATE_LIMIT_ENABLED: 'true' },
      controllers: [ProbeController],
    });
    try {
      const statuses = await hammer(app, 5);
      expect(statuses).toEqual([200, 200, 200, 429, 429]);
      const res = await request(app.getHttpServer()).get('/api/probe');
      expect(res.body.error.code).toBe('RATE_LIMITED');
      expect(res.headers['retry-after']).toBeDefined();
      // Health probes are exempt so load balancers never get throttled.
      await request(app.getHttpServer()).get('/api/health').expect(200);
    } finally {
      await app.close();
    }
  });

  (TEST_REDIS_URL ? it : it.skip)('shares counters through Redis across instances', async () => {
    const flush = new Redis(TEST_REDIS_URL!);
    await flush.flushdb();
    await flush.quit();
    const env = {
      RATE_LIMIT_MAX: '3',
      RATE_LIMIT_WINDOW_SECONDS: '60',
      RATE_LIMIT_ENABLED: 'true',
      REDIS_URL: TEST_REDIS_URL!,
    };
    const opts = { env, controllers: [ProbeController] };
    const [a, b] = await Promise.all([createTestApp(opts), createTestApp(opts)]);
    try {
      // Two API instances, one shared budget of 3 requests.
      const statuses = [...(await hammer(a, 2)), ...(await hammer(b, 2))];
      expect(statuses).toEqual([200, 200, 200, 429]);
      const ready = await request(a.getHttpServer()).get('/api/health/ready').expect(200);
      expect(ready.body.data.checks.redis).toBe('up');
    } finally {
      await Promise.all([a.close(), b.close()]);
    }
  });
});

describe('auth rate limits (integration)', () => {
  it('applies the stricter per-route limit to login (10/min per IP)', async () => {
    const app = await createTestApp({ env: { RATE_LIMIT_ENABLED: 'true' } });
    try {
      const { browser } = await import('./helpers/client');
      const c = await browser(app);
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        statuses.push(
          (
            await c.post('/api/auth/login', {
              identifier: 'x@example.com',
              password: 'wrong-pass-1',
            })
          ).status,
        );
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10)).toEqual([429, 429]);
    } finally {
      await app.close();
    }
  });
});
