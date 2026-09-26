import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { EnvelopeInterceptor } from './common/interceptors/envelope.interceptor';
import { RedisThrottlerStorage } from './common/throttle/redis-throttler.storage';
import { ConfigModule, ENV } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './messaging/messaging.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { SettingsModule } from './settings/settings.module';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    AuditModule,
    SettingsModule,
    MessagingModule,
    StorageModule,
    ThrottlerModule.forRootAsync({
      inject: [ENV, RedisService],
      useFactory: (env: Env, redis: RedisService) => ({
        // Global per-IP limit; sensitive routes (login, OTP, checkout) add stricter
        // @Throttle() limits. Redis storage keeps counts consistent across instances.
        throttlers: [
          { name: 'default', ttl: env.RATE_LIMIT_WINDOW_SECONDS * 1000, limit: env.RATE_LIMIT_MAX },
        ],
        storage: redis.client ? new RedisThrottlerStorage(redis.client) : undefined,
        skipIf: () => !env.RATE_LIMIT_ENABLED,
        errorMessage: 'Too many requests. Please wait a moment and try again.',
      }),
    }),
    AuthModule,
    UsersModule,
    CatalogModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
  ],
})
export class AppModule {}
