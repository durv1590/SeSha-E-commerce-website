import { HttpStatus, Injectable } from '@nestjs/common';
import type { Brand, Category } from '@prisma/client';
import type { AdminBrandDto, AdminCategoryDto } from '@seshakart/types';
import type { BrandInput, CategoryInput } from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { RevalidationService } from '../../cache/revalidation.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../actor';
import { resolveSlug } from './slug';

/** Three levels: category → subcategory → sub-subcategory (depth 0–2, CHECK-enforced). */
export const MAX_CATEGORY_DEPTH = 2;

const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `This ${what} doesn’t exist.`);

/** Staff management of categories (a tree) and brands. */
@Injectable()
export class TaxonomyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  // --------------------------------------------------------------- categories

  /** Every category, parents before children, siblings by sort order then name. */
  async categories(): Promise<AdminCategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true, children: true } } },
    });
    const byParent = new Map<string | null, typeof rows>();
    for (const r of rows) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    const out: AdminCategoryDto[] = [];
    const walk = (parentId: string | null) => {
      for (const c of byParent.get(parentId) ?? []) {
        out.push(categoryDto(c, c._count.products, c._count.children));
        walk(c.id);
      }
    };
    walk(null);
    return out;
  }

  async createCategory(input: CategoryInput, actor: Actor): Promise<AdminCategoryDto> {
    const depth = await this.depthUnder(input.parentId, null);
    const slug = await resolveSlug(input.slug, input.name, (s) => this.categorySlugTaken(s, null));
    const row = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.create({ data: { ...categoryFields(input), slug, depth } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'category.created',
          entityType: 'category',
          entityId: c.id,
          metadata: { name: c.name, slug },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return c;
    });
    await this.revalidation.catalogChanged();
    return categoryDto(row, 0, 0);
  }

  async updateCategory(id: string, input: CategoryInput, actor: Actor): Promise<AdminCategoryDto> {
    const current = await this.prisma.category.findUnique({ where: { id } });
    if (!current) throw notFound('category');
    const depth = await this.depthUnder(input.parentId, id);
    // Moving a category moves its whole subtree: the deepest descendant must still fit.
    const subtree = await this.subtree(id);
    const deepest = Math.max(...subtree.map((c) => c.depth)) - current.depth;
    if (depth + deepest > MAX_CATEGORY_DEPTH)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CATEGORY_TOO_DEEP',
        'Categories can be at most three levels deep, and this move would add a fourth.',
        [{ path: 'parentId', message: 'Choose a higher-level parent' }],
      );
    const slug =
      input.slug === current.slug
        ? current.slug
        : await resolveSlug(input.slug, input.name, (s) => this.categorySlugTaken(s, id));

    const row = await this.prisma.$transaction(async (tx) => {
      const c = await tx.category.update({
        where: { id },
        data: { ...categoryFields(input), slug, depth },
      });
      const shift = depth - current.depth;
      if (shift)
        for (const d of subtree.filter((s) => s.id !== id))
          await tx.category.update({ where: { id: d.id }, data: { depth: d.depth + shift } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'category.updated',
          entityType: 'category',
          entityId: id,
          metadata: {
            name: c.name,
            ...(current.parentId !== c.parentId
              ? { movedFrom: current.parentId, movedTo: c.parentId }
              : {}),
            ...(current.isActive !== c.isActive ? { isActive: c.isActive } : {}),
          },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return c;
    });
    await this.revalidation.catalogChanged();
    const counts = await this.prisma.category.findUniqueOrThrow({
      where: { id },
      select: { _count: { select: { products: true, children: true } } },
    });
    return categoryDto(row, counts._count.products, counts._count.children);
  }

  /** Deletes an empty category (no subcategories and no products). */
  async deleteCategory(id: string, actor: Actor): Promise<void> {
    const c = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true, children: true, homeSections: true } } },
    });
    if (!c) throw notFound('category');
    if (c._count.children || c._count.products || c._count.homeSections)
      throw new AppException(
        HttpStatus.CONFLICT,
        'CATEGORY_IN_USE',
        c._count.children
          ? 'Move or delete its subcategories first.'
          : c._count.products
            ? `Move its ${c._count.products} product${c._count.products === 1 ? '' : 's'} to another category first, or hide the category instead.`
            : 'A homepage section uses this category. Remove it from the homepage first.',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'category.deleted',
          entityType: 'category',
          entityId: id,
          metadata: { name: c.name, slug: c.slug },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    await this.revalidation.catalogChanged();
  }

  /** Depth a category gets under `parentId`, refusing cycles and a fourth level. */
  private async depthUnder(parentId: string | null, selfId: string | null): Promise<number> {
    if (!parentId) return 0;
    const parent = await this.prisma.category.findUnique({ where: { id: parentId } });
    if (!parent)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'VALIDATION_FAILED',
        'Choose a parent.',
        [{ path: 'parentId', message: 'This parent doesn’t exist' }],
      );
    if (selfId && (await this.subtree(selfId)).some((c) => c.id === parentId))
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CATEGORY_CYCLE',
        'A category can’t be placed inside itself or one of its subcategories.',
        [{ path: 'parentId', message: 'Choose a different parent' }],
      );
    if (parent.depth + 1 > MAX_CATEGORY_DEPTH)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'CATEGORY_TOO_DEEP',
        'Categories can be at most three levels deep.',
        [{ path: 'parentId', message: 'Choose a higher-level parent' }],
      );
    return parent.depth + 1;
  }

  /** The category and all its descendants. */
  private async subtree(id: string): Promise<{ id: string; depth: number }[]> {
    return this.prisma.$queryRaw<{ id: string; depth: number }[]>`
      WITH RECURSIVE t AS (
        SELECT "id", "depth" FROM "categories" WHERE "id" = ${id}
        UNION ALL
        SELECT c."id", c."depth" FROM "categories" c JOIN t ON c."parent_id" = t."id"
      ) SELECT "id", "depth" FROM t`;
  }

  private async categorySlugTaken(slug: string, exceptId: string | null) {
    const f = await this.prisma.category.findUnique({ where: { slug }, select: { id: true } });
    return Boolean(f && f.id !== exceptId);
  }

  // ------------------------------------------------------------------- brands

  async brands(): Promise<AdminBrandDto[]> {
    const rows = await this.prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return rows.map((b) => brandDto(b, b._count.products));
  }

  async createBrand(input: BrandInput, actor: Actor): Promise<AdminBrandDto> {
    await this.assertBrandNameFree(input.name, null);
    const slug = await resolveSlug(input.slug, input.name, (s) => this.brandSlugTaken(s, null));
    const row = await this.prisma.$transaction(async (tx) => {
      const b = await tx.brand.create({ data: { ...brandFields(input), slug } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'brand.created',
          entityType: 'brand',
          entityId: b.id,
          metadata: { name: b.name },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return b;
    });
    await this.revalidation.catalogChanged();
    return brandDto(row, 0);
  }

  async updateBrand(id: string, input: BrandInput, actor: Actor): Promise<AdminBrandDto> {
    const current = await this.prisma.brand.findUnique({ where: { id } });
    if (!current) throw notFound('brand');
    await this.assertBrandNameFree(input.name, id);
    const slug =
      input.slug === current.slug
        ? current.slug
        : await resolveSlug(input.slug, input.name, (s) => this.brandSlugTaken(s, id));
    const row = await this.prisma.$transaction(async (tx) => {
      const b = await tx.brand.update({ where: { id }, data: { ...brandFields(input), slug } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'brand.updated',
          entityType: 'brand',
          entityId: id,
          metadata: { name: b.name },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return b;
    });
    await this.revalidation.catalogChanged();
    return brandDto(row, await this.prisma.product.count({ where: { brandId: id } }));
  }

  /** Deletes a brand with no products (deleting would silently unbrand them). */
  async deleteBrand(id: string, actor: Actor): Promise<void> {
    const b = await this.prisma.brand.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!b) throw notFound('brand');
    if (b._count.products)
      throw new AppException(
        HttpStatus.CONFLICT,
        'BRAND_IN_USE',
        `${b._count.products} product${b._count.products === 1 ? ' uses' : 's use'} this brand. Change their brand first, or hide the brand instead.`,
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.brand.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'brand.deleted',
          entityType: 'brand',
          entityId: id,
          metadata: { name: b.name },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    await this.revalidation.catalogChanged();
  }

  private async assertBrandNameFree(name: string, exceptId: string | null) {
    const f = await this.prisma.brand.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true },
    });
    if (f && f.id !== exceptId)
      throw new AppException(HttpStatus.CONFLICT, 'BRAND_EXISTS', 'This brand already exists.', [
        { path: 'name', message: 'A brand with this name already exists' },
      ]);
  }

  private async brandSlugTaken(slug: string, exceptId: string | null) {
    const f = await this.prisma.brand.findUnique({ where: { slug }, select: { id: true } });
    return Boolean(f && f.id !== exceptId);
  }
}

function categoryFields(i: CategoryInput) {
  return {
    name: i.name,
    parentId: i.parentId,
    description: i.description,
    seoContent: i.seoContent,
    imageUrl: i.imageUrl,
    bannerUrl: i.bannerUrl,
    sortOrder: i.sortOrder,
    isActive: i.isActive,
    isFeatured: i.isFeatured,
    metaTitle: i.metaTitle,
    metaDescription: i.metaDescription,
  };
}

function brandFields(i: BrandInput) {
  return {
    name: i.name,
    description: i.description,
    logoUrl: i.logoUrl,
    isActive: i.isActive,
    isFeatured: i.isFeatured,
    metaTitle: i.metaTitle,
    metaDescription: i.metaDescription,
  };
}

function categoryDto(c: Category, productCount: number, childCount: number): AdminCategoryDto {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    parentId: c.parentId,
    depth: c.depth,
    description: c.description,
    seoContent: c.seoContent,
    imageUrl: c.imageUrl,
    bannerUrl: c.bannerUrl,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    isFeatured: c.isFeatured,
    metaTitle: c.metaTitle,
    metaDescription: c.metaDescription,
    productCount,
    childCount,
  };
}

function brandDto(b: Brand, productCount: number): AdminBrandDto {
  return {
    id: b.id,
    name: b.name,
    slug: b.slug,
    description: b.description,
    logoUrl: b.logoUrl,
    isActive: b.isActive,
    isFeatured: b.isFeatured,
    metaTitle: b.metaTitle,
    metaDescription: b.metaDescription,
    productCount,
  };
}
