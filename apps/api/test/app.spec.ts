import { Controller, Get, HttpStatus, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { AppException } from '../src/common/filters/all-exceptions.filter';
import { loadEnv } from '../src/config/env';

@Controller('test-errors')
class ErrorController {
  @Get('domain')
  domain(): never {
    throw new AppException(HttpStatus.CONFLICT, 'OUT_OF_STOCK', 'This item is out of stock.');
  }

  @Get('crash')
  crash(): never {
    throw new Error('connect ECONNREFUSED /var/secret/db.sock SELECT * FROM users');
  }
}

describe('API foundation (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ErrorController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, loadEnv({ APP_URL: 'https://www.seshakart.com' }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health returns the success envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.data).toMatchObject({ status: 'ok', service: 'seshakart-api' });
    expect(res.headers['x-request-id']).toBeDefined();
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
    const res = await request(app.getHttpServer()).get('/api/test-errors/domain').expect(409);
    expect(res.body.error).toMatchObject({
      code: 'OUT_OF_STOCK',
      message: 'This item is out of stock.',
    });
  });

  it('never leaks internals on unexpected errors', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-errors/crash').expect(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/ECONNREFUSED|SELECT|\/var\/secret|stack/i);
  });
});
