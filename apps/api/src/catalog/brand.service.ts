import { HttpStatus, Injectable } from '@nestjs/common';
import type { Brand } from '@prisma/client';
import type { BrandDto } from '@seshakart/types';
import { CacheService } from '../cache/cache.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../database/prisma.service';
import { CATALOG_CACHE_PREFIX } from './category.service';

export function toBrandDto(b: Brand): BrandDto {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logoUrl: b.logoUrl,
    isFeatured: b.isFeatured,
    metaTitle: b.metaTitle,
    metaDescription: b.metaDescription,
  };
}

@Injectable()
export class BrandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  list(featuredOnly = false): Promise<BrandDto[]> {
    return this.cache.wrap(
      `${CATALOG_CACHE_PREFIX}brands:${featuredOnly ? 'featured' : 'all'}`,
      300,
      async () => {
        const rows = await this.prisma.brand.findMany({
          where: { isActive: true, ...(featuredOnly ? { isFeatured: true } : {}) },
          orderBy: { name: 'asc' },
        });
        return rows.map(toBrandDto);
      },
    );
  }

  async bySlug(slug: string): Promise<BrandDto> {
    const brand = await this.prisma.brand.findFirst({ where: { slug, isActive: true } });
    if (!brand)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This brand is not available.');
    return toBrandDto(brand);
  }
}
