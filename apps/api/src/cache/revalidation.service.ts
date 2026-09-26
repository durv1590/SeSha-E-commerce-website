import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { CATALOG_CACHE_PREFIX } from '../catalog/category.service';
import { CacheService } from './cache.service';

export type WebTag = 'catalog' | 'settings' | 'content';

/** Redis prefix for CMS pages and SEO overrides. */
export const CONTENT_CACHE_PREFIX = 'content:';

/**
 * After admin changes, cached copies must not linger: the API's Redis cache is cleared
 * and the storefront is asked to drop its cached pages for the affected tags, so
 * shoppers see the change immediately (instead of after the 60-second cache window).
 * Failures are logged, never thrown: the caches also expire on their own.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger('Revalidate');

  constructor(
    private readonly cache: CacheService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async catalogChanged(): Promise<void> {
    await this.cache.delByPrefix(CATALOG_CACHE_PREFIX);
    await this.web(['catalog']);
  }

  async settingsChanged(): Promise<void> {
    await this.cache.delByPrefix('settings:');
    await this.cache.delByPrefix(CATALOG_CACHE_PREFIX);
    await this.web(['settings', 'catalog']);
  }

  /** CMS pages and SEO overrides. */
  async contentChanged(): Promise<void> {
    await this.cache.delByPrefix(CONTENT_CACHE_PREFIX);
    await this.web(['content']);
  }

  private async web(tags: WebTag[]): Promise<void> {
    if (!this.env.WEB_INTERNAL_URL || !this.env.REVALIDATE_SECRET) return;
    try {
      const res = await fetch(`${this.env.WEB_INTERNAL_URL}/internal/revalidate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-revalidate-secret': this.env.REVALIDATE_SECRET,
        },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) this.logger.warn(`Storefront revalidation returned ${res.status}`);
    } catch (err) {
      this.logger.warn(`Storefront revalidation failed: ${(err as Error).message}`);
    }
  }
}
