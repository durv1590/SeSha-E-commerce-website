import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadEnv } from './config/env';

// Local development: load the repository-root .env. In production, variables come
// from the platform's secret manager and no .env file exists.
const rootEnv = join(__dirname, '..', '..', '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'].slice(
      0,
      ['error', 'warn', 'log', 'debug', 'verbose'].indexOf(env.LOG_LEVEL) + 1,
    ) as ('error' | 'warn' | 'log' | 'debug' | 'verbose')[],
  });
  configureApp(app, env);
  await app.listen(env.API_PORT);
  Logger.log(`SeShaKart API listening on :${env.API_PORT}`, 'Bootstrap');
}

void bootstrap();
