import { Global, Module } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';
import { RevalidationService } from '../cache/revalidation.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, CacheService, RevalidationService],
  exports: [RedisService, CacheService, RevalidationService],
})
export class RedisModule {}
