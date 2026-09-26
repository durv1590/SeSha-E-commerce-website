import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { static as serveStatic } from 'express';
import helmet from 'helmet';
import { csrfProtection } from './auth/csrf.middleware';
import { requestId } from './common/middleware/request-id.middleware';
import { allowedOrigins, type Env } from './config/env';
import { StorageService } from './storage/storage.service';

export const API_PREFIX = 'api';

/**
 * Applies cross-cutting HTTP configuration. Shared by main.ts and the integration
 * tests so tests exercise exactly the production middleware stack.
 */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS > 0) express.set('trust proxy', env.TRUST_PROXY_HOPS);

  app.use(requestId);
  // The API only serves JSON, so it can use a very strict CSP.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(cookieParser());
  app.use(csrfProtection(env));
  app.enableCors({
    origin: allowedOrigins(env),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-CSRF-Token'],
    maxAge: 600,
  });
  app.setGlobalPrefix(API_PREFIX);

  // Local media driver: immutable, content-addressed files. Never directory listings,
  // dotfiles or execution; a strict CSP neutralises any active content.
  if (env.MEDIA_DRIVER === 'local') {
    const storage = app.get(StorageService);
    app.use(
      `/${API_PREFIX}/media`,
      (_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        next();
      },
      serveStatic(storage.localDir, {
        immutable: true,
        maxAge: '365d',
        index: false,
        dotfiles: 'deny',
        fallthrough: true,
        redirect: false,
      }),
    );
  }
  app.enableShutdownHooks();
}
