import { Injectable } from '@nestjs/common';
import type { SitemapDto, SitemapEntryDto } from '@seshakart/types';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';
import { CATALOG_CACHE_PREFIX, CategoryService } from './category.service';

/** Sitemap files allow 50,000 URLs; static routes, categories, brands and pages need some. */
export const SITEMAP_MAX_PRODUCTS = 45_000;
const TTL = 900;
/** Google indexes up to 1,000 images per URL, but a few representative ones are enough. */
const IMAGES_PER_PRODUCT = 5;

/**
 * The public sitemap feed. It follows exactly the visibility rules customers see: live
 * products in visible categories (hidden ancestors hide their subtree), visible brands and
 * categories that actually have live products (empty listings are thin content), and
 * published CMS pages.
 */
@Injectable()
export class SitemapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly categories: CategoryService,
  ) {}

  async get(): Promise<SitemapDto> {
    const [catalog, pages] = await Promise.all([
      this.cache.wrap(`${CATALOG_CACHE_PREFIX}sitemap`, TTL, () => this.catalog()),
      // Pages are few and uncached here so a publish shows up on the next crawl.
      this.prisma.page.findMany({
        where: { isPublished: true },
        orderBy: { slug: 'asc' },
        select: { slug: true, updatedAt: true },
      }),
    ]);
    return { ...catalog, pages: pages.map(entry) };
  }

  private async catalog(): Promise<Omit<SitemapDto, 'pages'>> {
    const idx = await this.categories.index();
    const visibleIds = Object.keys(idx.byId);
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', categoryId: { in: visibleIds } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: SITEMAP_MAX_PRODUCTS,
      select: {
        slug: true,
        updatedAt: true,
        categoryId: true,
        brandId: true,
        images: { orderBy: { position: 'asc' }, take: IMAGES_PER_PRODUCT, select: { url: true } },
      },
    });

    const liveCategoryIds = new Set(products.map((p) => p.categoryId));
    const categoryRows = await this.prisma.category.findMany({
      where: { id: { in: visibleIds } },
      orderBy: { slug: 'asc' },
      select: { id: true, slug: true, updatedAt: true },
    });
    const categories = categoryRows.filter((c) =>
      idx.bySlug[c.slug]?.subtreeIds.some((id) => liveCategoryIds.has(id)),
    );

    const brandIds = [...new Set(products.map((p) => p.brandId).filter((b): b is string => !!b))];
    const brands = await this.prisma.brand.findMany({
      where: { id: { in: brandIds }, isActive: true },
      orderBy: { slug: 'asc' },
      select: { slug: true, updatedAt: true },
    });

    return {
      products: products.map((p) => ({ ...entry(p), images: p.images.map((i) => i.url) })),
      categories: categories.map(entry),
      brands: brands.map(entry),
    };
  }
}

function entry(r: { slug: string; updatedAt: Date }): SitemapEntryDto {
  return { slug: r.slug, updatedAt: r.updatedAt.toISOString() };
}
