import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { loadEnv } from '../../src/config/env';

/** Boots the real application (same middleware stack as production) for integration tests. */
export async function createTestApp(
  opts: { env?: Record<string, string>; controllers?: Type[] } = {},
): Promise<INestApplication> {
  const previous = { ...process.env };
  Object.assign(process.env, opts.env);
  try {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: opts.controllers ?? [],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, loadEnv({ ...process.env, APP_URL: 'https://www.seshakart.com' }));
    await app.init();
    return app;
  } finally {
    process.env = previous;
  }
}
