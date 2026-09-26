import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Optional Redis connection. In production REDIS_URL is mandatory (enforced by env
 * validation); in development/test the app falls back to in-process stores so
 * contributors can run it without Redis.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  readonly client: Redis | null;

  constructor(@Inject(ENV) env: Env) {
    if (!env.REDIS_URL) {
      this.client = null;
      this.logger.warn(
        'REDIS_URL not set — using in-memory cache and rate limiting (single instance only).',
      );
      return;
    }
    this.client = new Redis(env.REDIS_URL, {
      keyPrefix: 'sk:',
      maxRetriesPerRequest: 2,
      // Fail fast instead of queueing when Redis is down; callers degrade gracefully.
      enableOfflineQueue: false,
      // Connect explicitly in onModuleInit so no command runs before the socket is ready.
      lazyConnect: true,
    });
    this.client.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));
  }

  /**
   * Waits for the initial connection so the first requests after boot can use the
   * cache. If Redis is unreachable the API still starts (readiness reports it);
   * ioredis keeps reconnecting in the background.
   */
  async onModuleInit(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.error(`Initial Redis connection failed: ${(err as Error).message}`);
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  async isHealthy(): Promise<boolean | null> {
    if (!this.client) return null;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
