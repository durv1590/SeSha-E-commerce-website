import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HealthStatus } from '@seshakart/types';

const startedAt = Date.now();
// Same relative path from src/health (tests) and dist/health (production build).
const { version } = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
) as { version: string };

@Controller('health')
export class HealthController {
  /** Liveness probe for load balancers and container orchestration. */
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      service: 'seshakart-api',
      version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      // Database and Redis checks are registered here when those modules land (Phase 3).
      checks: { database: 'skipped', redis: 'skipped' },
    };
  }
}
