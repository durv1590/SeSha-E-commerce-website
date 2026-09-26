import { Injectable } from '@nestjs/common';
import type { Banner, HomeSection } from '@prisma/client';
import type { BannerDto, HomePageDto, HomeSectionDto } from '@seshakart/types';
import type { ProductListQuery } from '@seshakart/validation';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../database/prisma.service';
import { BrandService } from './brand.service';
import { CATALOG_CACHE_PREFIX, CategoryService } from './category.service';
import { ProductService } from './product.service';

const HOME_TTL = 60;

function toBannerDto(b: Banner): BannerDto {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    ctaLabel: b.ctaLabel,
    link: b.link,
    placement: b.placement,
    theme: b.theme,
    imageDesktop: b.imageDesktop,
    imageTablet: b.imageTablet,
    imageMobile: b.imageMobile,
    imageAlt: b.imageAlt,
  };
}

/** Each admin-configured homepage section maps to a listing query and a "View all" page. */
function sectionQuery(
  s: HomeSection,
  categorySlug?: string,
): { query: Partial<ProductListQuery>; href: string } {
  switch (s.source) {
    case 'BEST_SELLERS':
      return { query: { sort: 'popular', inStock: true }, href: '/best-sellers' };
    case 'NEW_ARRIVALS':
      return { query: { sort: 'newest', inStock: true }, href: '/new-arrivals' };
    case 'DEALS':
      return { query: { sort: 'discount', discount: 20, inStock: true }, href: '/deals' };
    case 'FEATURED':
      return { query: { featured: true, sort: 'popular' }, href: '/products?featured=1' };
    case 'CATEGORY':
      return {
        query: { category: categorySlug, sort: 'popular', inStock: true },
        href: `/category/${categorySlug}`,
      };
  }
}

/** Homepage composition — entirely admin-managed (banners, sections), never hard-coded. */
@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly products: ProductService,
    private readonly categories: CategoryService,
    private readonly brands: BrandService,
  ) {}

  get(): Promise<HomePageDto> {
    return this.cache.wrap(`${CATALOG_CACHE_PREFIX}home`, HOME_TTL, async () => {
      const now = new Date();
      const [banners, sections, featuredCategories, featuredBrands] = await Promise.all([
        this.prisma.banner.findMany({
          where: {
            isActive: true,
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
          orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        }),
        this.prisma.homeSection.findMany({
          where: { isActive: true },
          orderBy: { position: 'asc' },
          include: { category: { select: { slug: true, isActive: true } } },
        }),
        this.categories.featured(),
        this.brands.list(true),
      ]);

      const built: HomeSectionDto[] = [];
      for (const s of sections) {
        if (s.source === 'CATEGORY' && !s.category?.isActive) continue;
        const { query, href } = sectionQuery(s, s.category?.slug);
        const items = await this.products.summaries(query, s.limit);
        if (items.length === 0) continue; // never render empty rails
        built.push({
          id: s.id,
          title: s.title,
          subtitle: s.subtitle,
          source: s.source,
          viewAllHref: href,
          products: items,
        });
      }

      return {
        heroBanners: banners
          .filter((b) => b.placement === 'HOME_HERO')
          .slice(0, 5)
          .map(toBannerDto),
        promoBanners: banners
          .filter((b) => b.placement === 'HOME_PROMO')
          .slice(0, 4)
          .map(toBannerDto),
        featuredCategories,
        sections: built,
        featuredBrands: featuredBrands.slice(0, 12),
      };
    });
  }
}
