import { Controller, Get, HttpStatus, Post, type INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { emailSchema, paginationSchema } from '@seshakart/validation';
import request from 'supertest';
import { z } from 'zod';
import { AppException } from '../src/common/filters/all-exceptions.filter';
import { ZodBody, ZodQuery } from '../src/common/validation/zod.pipe';
import { createTestApp } from './helpers/app';
import { browser } from './helpers/client';

const signupSchema = z.object({ email: emailSchema, name: z.string().min(2) });

@Controller('test')
class ProbeController {
  @Get('domain')
  domain(): never {
    throw new AppException(HttpStatus.CONFLICT, 'OUT_OF_STOCK', 'This item is out of stock.');
  }

  @Get('crash')
  crash(): never {
    throw new Error('connect ECONNREFUSED /var/secret/db.sock SELECT * FROM users');
  }

  @Get('duplicate')
  duplicate(): never {
    throw new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`email`)',
      {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email'] },
      },
    );
  }

  @Post('signup')
  signup(@ZodBody(signupSchema) body: z.infer<typeof signupSchema>) {
    return body;
  }

  @Get('list')
  list(@ZodQuery(paginationSchema) q: z.infer<typeof paginationSchema>) {
    return q;
  }
}

describe('API foundation (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns the success envelope without touching dependencies', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      service: 'seshakart-api',
      version: '0.1.0',
    });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/health/ready checks the database', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(res.body.data.checks).toEqual({ database: 'up', redis: 'skipped' });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('allows the storefront origin and rejects others via CORS', async () => {
    const ok = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://www.seshakart.com');
    expect(ok.headers['access-control-allow-origin']).toBe('https://www.seshakart.com');
    const bad = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a standard error envelope for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('exposes domain error codes', async () => {
    const res = await request(app.getHttpServer()).get('/api/test/domain').expect(409);
    expect(res.body.error).toMatchObject({
      code: 'OUT_OF_STOCK',
      message: 'This item is out of stock.',
    });
  });

  it('never leaks internals on unexpected errors', async () => {
    const res = await request(app.getHttpServer()).get('/api/test/crash').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|SELECT|\/var\/secret|stack/i);
  });

  it('maps database unique violations to 409 without exposing column names', async () => {
    const res = await request(app.getHttpServer()).get('/api/test/duplicate').expect(409);
    expect(res.body.error.code).toBe('ALREADY_EXISTS');
    expect(JSON.stringify(res.body)).not.toMatch(/email|P2002|constraint/i);
  });

  describe('Zod validation pipe', () => {
    it('returns 422 with field details for invalid input', async () => {
      const res = await (
        await browser(app)
      )
        .post('/api/test/signup', { email: 'nope', name: 'A' })
        .expect(422);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
        'email',
        'name',
      ]);
    });

    it('strips unknown fields (no mass assignment) and normalises values', async () => {
      const res = await (
        await browser(app)
      )
        .post('/api/test/signup', {
          email: ' Buyer@Example.COM ',
          name: 'Asha',
          role: 'SUPER_ADMIN',
        })
        .expect(201);
      expect(res.body.data).toEqual({ email: 'buyer@example.com', name: 'Asha' });
    });

    it('coerces and bounds query parameters', async () => {
      await request(app.getHttpServer())
        .get('/api/test/list?page=2&pageSize=10')
        .expect(200, {
          data: { page: 2, pageSize: 10 },
        });
      await request(app.getHttpServer()).get('/api/test/list?pageSize=1000').expect(422);
    });
  });
});
