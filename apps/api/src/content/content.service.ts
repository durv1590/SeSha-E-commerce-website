import { HttpStatus, Injectable } from '@nestjs/common';
import type { CmsPageDto, SeoOverrideDto } from '@seshakart/types';
import { CacheService } from '../cache/cache.service';
import { CONTENT_CACHE_PREFIX } from '../cache/revalidation.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../database/prisma.service';

const TTL = 300;

/** Published CMS pages and SEO overrides for the storefront (cached; cleared on edit). */
@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  pages(): Promise<{ slug: string; title: string }[]> {
    return this.cache.wrap(`${CONTENT_CACHE_PREFIX}pages`, TTL, () =>
      this.prisma.page.findMany({
        where: { isPublished: true },
        orderBy: { title: 'asc' },
        select: { slug: true, title: true },
      }),
    );
  }

  async page(slug: string): Promise<CmsPageDto> {
    const page = await this.cache.wrap(`${CONTENT_CACHE_PREFIX}page:${slug}`, TTL, async () => {
      const p = await this.prisma.page.findFirst({ where: { slug, isPublished: true } });
      return p
        ? {
            slug: p.slug,
            title: p.title,
            content: p.content,
            metaTitle: p.metaTitle,
            metaDescription: p.metaDescription,
            updatedAt: p.updatedAt.toISOString(),
          }
        : null;
    });
    if (!page)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This page doesn’t exist.');
    return page;
  }

  seoOverrides(): Promise<SeoOverrideDto[]> {
    return this.cache.wrap(`${CONTENT_CACHE_PREFIX}seo`, TTL, () =>
      this.prisma.seoOverride.findMany({
        select: { path: true, title: true, description: true, ogImage: true, noindex: true },
        orderBy: { path: 'asc' },
      }),
    );
  }
}
