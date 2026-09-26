import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  FacetValue,
  ProductBadge,
  ProductDetail,
  ProductFacets,
  ProductListResult,
  ProductSummary,
  SpecificationDto,
  StockState,
} from '@seshakart/types';
import type { ProductListQuery } from '@seshakart/validation';
import { createHash } from 'node:crypto';
import { CacheService } from '../cache/cache.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { paginated, type Envelope } from '../common/http/envelope';
import { PrismaService } from '../database/prisma.service';
import { CATALOG_CACHE_PREFIX, CategoryService } from './category.service';

const LIST_TTL = 60;
const DETAIL_TTL = 60;
/** A product is "new" for this many days after publishing. */
const NEW_DAYS = 30;
/** Units sold to earn the Bestseller badge. */
const BESTSELLER_MIN_SOLD = 50;
/** Discount (percent) that earns the Deal badge. */
const DEAL_MIN_DISCOUNT = 30;

/** Fields needed to render a product card — kept small for listing performance. */
const summaryInclude = {
  brand: { select: { id: true, name: true, slug: true } },
  category: { select: { id: true, name: true, slug: true } },
  images: {
    orderBy: { position: 'asc' },
    take: 1,
    select: { url: true, alt: true, width: true, height: true },
  },
  variants: {
    where: { isActive: true },
    orderBy: [{ isDefault: 'desc' }, { price: 'asc' }],
    select: {
      id: true,
      inventory: { select: { stock: true, reserved: true, lowStockThreshold: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type SummaryRow = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;

function stockState(available: number, threshold: number): StockState {
  if (available <= 0) return 'out_of_stock';
  return available <= threshold ? 'low_stock' : 'in_stock';
}

export function toSummary(p: SummaryRow, now = Date.now()): ProductSummary {
  // Prefer a default variant that is actually purchasable; otherwise the first in stock.
  const withStock = p.variants.map((v) => ({
    id: v.id,
    available: Math.max(0, (v.inventory?.stock ?? 0) - (v.inventory?.reserved ?? 0)),
    threshold: v.inventory?.lowStockThreshold ?? 5,
  }));
  const purchasable = withStock.find((v) => v.available > 0) ?? withStock[0];
  const badges: ProductBadge[] = [];
  if (p.maxDiscountPct >= DEAL_MIN_DISCOUNT) badges.push('DEAL');
  if (p.soldCount >= BESTSELLER_MIN_SOLD) badges.push('BESTSELLER');
  if (p.publishedAt && now - p.publishedAt.getTime() < NEW_DAYS * 86_400_000) badges.push('NEW');
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category,
    image: p.images[0] ?? null,
    defaultVariantId: purchasable?.id ?? null,
    hasMultipleVariants: p.variants.length > 1,
    price: p.minPrice,
    mrp: p.minPriceMrp,
    maxDiscountPercent: p.maxDiscountPct,
    ratingAvg: Math.round(p.ratingAvg * 10) / 10,
    ratingCount: p.ratingCount,
    stock: stockState(p.availableStock, Math.min(...withStock.map((v) => v.threshold), 5)),
    available: p.availableStock,
    badges,
  };
}

const ORDER_BY: Record<ProductListQuery['sort'], Prisma.ProductOrderByWithRelationInput[]> = {
  relevance: [{ soldCount: 'desc' }],
  popular: [{ soldCount: 'desc' }, { ratingCount: 'desc' }],
  newest: [{ publishedAt: 'desc' }],
  price_asc: [{ minPrice: 'asc' }],
  price_desc: [{ minPrice: 'desc' }],
  discount: [{ maxDiscountPct: 'desc' }, { soldCount: 'desc' }],
  rating: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
};

/**
 * Public catalogue reads. Only ACTIVE products in active categories are ever
 * returned; drafts and archived products are invisible to customers.
 */
@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly categories: CategoryService,
  ) {}

  private cacheKey(kind: string, value: unknown): string {
    const hash = createHash('sha1').update(JSON.stringify(value)).digest('hex').slice(0, 16);
    return `${CATALOG_CACHE_PREFIX}${kind}:${hash}`;
  }

  /** WHERE clause for a listing query. `omit` drops one filter (for that filter's own facet). */
  private async where(
    q: ProductListQuery,
    omit?: 'category' | 'brand' | 'price',
  ): Promise<Prisma.ProductWhereInput | null> {
    const and: Prisma.ProductWhereInput[] = [{ status: 'ACTIVE' }];
    const activeCategoryIds = Object.values((await this.categories.index()).bySlug).map(
      (e) => e.node.id,
    );
    if (q.category && omit !== 'category') {
      const ids = await this.categories.subtreeIds(q.category);
      if (!ids) return null; // unknown or inactive category
      and.push({ categoryId: { in: ids } });
    } else {
      and.push({ categoryId: { in: activeCategoryIds } });
    }
    if (q.brand?.length && omit !== 'brand')
      and.push({ brand: { slug: { in: q.brand }, isActive: true } });
    if (omit !== 'price' && (q.min !== undefined || q.max !== undefined)) {
      and.push({
        minPrice: {
          ...(q.min !== undefined ? { gte: q.min } : {}),
          ...(q.max !== undefined ? { lte: q.max } : {}),
        },
      });
    }
    if (q.rating) and.push({ ratingAvg: { gte: q.rating } });
    if (q.discount) and.push({ maxDiscountPct: { gte: q.discount } });
    if (q.inStock) and.push({ availableStock: { gt: 0 } });
    if (q.featured) and.push({ isFeatured: true });
    return { AND: and };
  }

  async list(q: ProductListQuery): Promise<Envelope<ProductListResult>> {
    // Cache plain data; the response envelope is rebuilt after the JSON round trip.
    const { result, total } = await this.cache.wrap(
      this.cacheKey('list', q),
      LIST_TTL,
      async () => {
        const where = await this.where(q);
        if (!where)
          throw new AppException(
            HttpStatus.NOT_FOUND,
            'NOT_FOUND',
            'This category is not available.',
          );
        const [total, rows, facets] = await Promise.all([
          this.prisma.product.count({ where }),
          this.prisma.product.findMany({
            where,
            include: summaryInclude,
            orderBy: [...ORDER_BY[q.sort], { id: 'asc' }], // stable pagination
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          this.facets(q),
        ]);
        const now = Date.now();
        return {
          result: { items: rows.map((r) => toSummary(r, now)), facets } as ProductListResult,
          total,
        };
      },
    );
    return paginated(result, total, q.page, q.pageSize);
  }

  /** Summaries for rails and collections (homepage sections, related products). */
  async summaries(q: Partial<ProductListQuery>, take: number): Promise<ProductSummary[]> {
    const query = { sort: 'popular', page: 1, pageSize: take, ...q } as ProductListQuery;
    const where = await this.where(query);
    if (!where) return [];
    const rows = await this.prisma.product.findMany({
      where,
      include: summaryInclude,
      orderBy: [...ORDER_BY[query.sort], { id: 'asc' }],
      take,
    });
    return rows.map((r) => toSummary(r));
  }

  private async facets(q: ProductListQuery): Promise<ProductFacets> {
    const [categoryWhere, brandWhere, priceWhere, fullWhere] = await Promise.all([
      this.where(q, 'category'),
      this.where(q, 'brand'),
      this.where(q, 'price'),
      this.where(q),
    ]);
    const idx = await this.categories.index();

    // Category facet: the children of the current category (or the top level), each
    // counting its whole subtree, restricted to the current category.
    const scopeNodes = q.category ? (idx.bySlug[q.category]?.node.children ?? []) : idx.roots;
    const scopeIds = q.category ? (idx.bySlug[q.category]?.subtreeIds ?? []) : undefined;
    const [byCategory, byBrand, price, inStockCount] = await Promise.all([
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { AND: [categoryWhere!, ...(scopeIds ? [{ categoryId: { in: scopeIds } }] : [])] },
        _count: { _all: true },
      }),
      this.prisma.product.groupBy({ by: ['brandId'], where: brandWhere!, _count: { _all: true } }),
      this.prisma.product.aggregate({
        where: priceWhere!,
        _min: { minPrice: true },
        _max: { minPrice: true },
      }),
      this.prisma.product.count({ where: { AND: [fullWhere!, { availableStock: { gt: 0 } }] } }),
    ]);

    const countByCategory = new Map(byCategory.map((r) => [r.categoryId, r._count._all]));
    const categories: FacetValue[] = scopeNodes
      .map((n) => ({
        value: n.slug,
        label: n.name,
        count: (idx.bySlug[n.slug]?.subtreeIds ?? []).reduce(
          (sum, id) => sum + (countByCategory.get(id) ?? 0),
          0,
        ),
      }))
      .filter((f) => f.count > 0);

    const brandIds = byBrand.map((b) => b.brandId).filter((id): id is string => Boolean(id));
    const brandRows = brandIds.length
      ? await this.prisma.brand.findMany({
          where: { id: { in: brandIds }, isActive: true },
          select: { id: true, slug: true, name: true },
        })
      : [];
    const brandCount = new Map(byBrand.map((b) => [b.brandId, b._count._all]));
    const brands: FacetValue[] = brandRows
      .map((b) => ({ value: b.slug, label: b.name, count: brandCount.get(b.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

    return {
      categories,
      brands,
      priceRange: { min: price._min.minPrice ?? 0, max: price._max.minPrice ?? 0 },
      inStockCount,
    };
  }

  async detail(slug: string): Promise<ProductDetail> {
    return this.cache.wrap(`${CATALOG_CACHE_PREFIX}product:${slug}`, DETAIL_TTL, async () => {
      const p = await this.prisma.product.findFirst({
        where: { slug, status: 'ACTIVE', category: { isActive: true } },
        include: {
          brand: true,
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { position: 'asc' } },
          variants: {
            where: { isActive: true },
            orderBy: [{ position: 'asc' }, { price: 'asc' }],
            include: { inventory: true, images: { select: { id: true } } },
          },
        },
      });
      if (!p || !(await this.categories.breadcrumbsForId(p.categoryId)).length) {
        throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This product is not available.');
      }

      const summary = toSummary({
        ...p,
        brand: p.brand ? { id: p.brand.id, name: p.brand.name, slug: p.brand.slug } : null,
        images: p.images.slice(0, 1),
        variants: p.variants,
      });
      const variants = p.variants.map((v) => {
        const available = Math.max(0, (v.inventory?.stock ?? 0) - (v.inventory?.reserved ?? 0));
        return {
          id: v.id,
          sku: v.sku,
          name: v.name,
          options: (v.options ?? {}) as Record<string, string>,
          mrp: v.mrp,
          price: v.price,
          available,
          stock: stockState(available, v.inventory?.lowStockThreshold ?? 5),
          isDefault: v.isDefault,
          imageIds: v.images.map((i) => i.id),
        };
      });
      const optionNames = [...new Set(variants.flatMap((v) => Object.keys(v.options)))];
      const hasDims = p.lengthMm && p.widthMm && p.heightMm;
      const { image: _unused, ...rest } = summary;
      void _unused;
      return {
        ...rest,
        sku: p.sku,
        shortDescription: p.shortDescription,
        description: p.description,
        highlights: p.highlights,
        specifications: Array.isArray(p.specifications)
          ? (p.specifications as unknown as SpecificationDto[])
          : [],
        tags: p.tags,
        images: p.images.map((i) => ({
          id: i.id,
          url: i.url,
          alt: i.alt,
          width: i.width,
          height: i.height,
        })),
        videoUrl: p.videoUrl,
        variants,
        optionNames,
        taxRate: p.taxRate,
        hsnCode: p.hsnCode,
        weightGrams: p.weightGrams,
        dimensions: hasDims
          ? { lengthMm: p.lengthMm!, widthMm: p.widthMm!, heightMm: p.heightMm! }
          : null,
        shippingInfo: p.shippingInfo,
        returnInfo: p.returnInfo,
        warrantyInfo: p.warrantyInfo,
        isReturnable: p.isReturnable,
        returnWindowDays: p.returnWindowDays,
        isCodAvailable: p.isCodAvailable,
        breadcrumbs: await this.categories.breadcrumbsForId(p.categoryId),
        metaTitle: p.metaTitle,
        metaDescription: p.metaDescription,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        updatedAt: p.updatedAt.toISOString(),
      };
    });
  }

  async related(slug: string, take = 12): Promise<ProductSummary[]> {
    return this.cache.wrap(`${CATALOG_CACHE_PREFIX}related:${slug}`, DETAIL_TTL, async () => {
      const p = await this.prisma.product.findFirst({
        where: { slug, status: 'ACTIVE' },
        select: { id: true, categoryId: true },
      });
      if (!p) return [];
      const rows = await this.prisma.product.findMany({
        where: { status: 'ACTIVE', categoryId: p.categoryId, id: { not: p.id } },
        include: summaryInclude,
        orderBy: [{ soldCount: 'desc' }, { id: 'asc' }],
        take,
      });
      return rows.map((r) => toSummary(r));
    });
  }
}
