import { Controller, Get, HttpCode, HttpStatus, Inject, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { HealthStatus } from '@seshakart/types';
import type { Response } from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

const startedAt = Date.now();
// Same relative path from src/health (tests) and dist/health (production build).
const { version } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as {
  version: string;
};

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Liveness: the process is up. Never touches dependencies, so it can't cascade failures. */
  @Get()
  live(): HealthStatus {
    return this.status('ok', {});
  }

  /**
   * Readiness: dependencies are reachable. Returns 503 when the database is down
   * (or Redis in production) so load balancers stop routing traffic here.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    const [db, redis] = await Promise.all([this.prisma.isHealthy(), this.redis.isHealthy()]);
    const checks: HealthStatus['checks'] = {
      database: db ? 'up' : 'down',
      redis: redis === null ? 'skipped' : redis ? 'up' : 'down',
    };
    const redisRequired = this.env.NODE_ENV === 'production';
    const healthy = db && (redis !== false || !redisRequired);
    if (!healthy) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return this.status(healthy ? 'ok' : 'degraded', checks);
  }

  private status(status: HealthStatus['status'], checks: HealthStatus['checks']): HealthStatus {
    return {
      status,
      service: 'seshakart-api',
      version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      checks,
    };
  }
}
