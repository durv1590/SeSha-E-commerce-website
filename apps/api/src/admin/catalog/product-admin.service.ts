import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type ProductStatus } from '@prisma/client';
import type { AdminProductDto, AdminProductListItemDto, PaginationMeta } from '@seshakart/types';
import type { AdminProductListQuery, ProductInput, VariantInput } from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { RevalidationService } from '../../cache/revalidation.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../actor';
import { resolveSlug } from './slug';

type Tx = Prisma.TransactionClient;
type FieldError = { path: string; message: string };

const DETAIL_INCLUDE = {
  variants: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { inventory: true, _count: { select: { orderItems: true } } },
  },
  images: { orderBy: { position: 'asc' }, include: { variant: { select: { sku: true } } } },
  _count: { select: { orderItems: true } },
} satisfies Prisma.ProductInclude;
type ProductWithDetail = Prisma.ProductGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const invalid = (message: string, details: FieldError[] = [], code = 'VALIDATION_FAILED') =>
  new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This product doesn’t exist.');

/**
 * Staff product management. A product is saved as a whole (details, variants and
 * images) in one transaction: variants missing from the payload are deleted, or
 * deactivated when they have been ordered, so order history always stays intact.
 * Listing aggregates (min price, stock) are maintained by database triggers.
 */
@Injectable()
export class ProductAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async list(
    q: AdminProductListQuery,
  ): Promise<{ data: AdminProductListItemDto[]; meta: PaginationMeta }> {
    const and: Prisma.ProductWhereInput[] = [];
    if (q.status !== 'all') and.push({ status: q.status });
    if (q.categoryId) and.push({ categoryId: q.categoryId });
    if (q.brandId) and.push({ brandId: q.brandId });
    if (q.q) {
      const term = q.q;
      and.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } },
        ],
      });
    }
    if (q.stock === 'out') and.push({ availableStock: { lte: 0 } });
    if (q.stock === 'low') {
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT v."product_id" AS id FROM "inventory" i
        JOIN "product_variants" v ON v."id" = i."variant_id" AND v."is_active"
        WHERE i."stock" - i."reserved" > 0 AND i."stock" - i."reserved" <= i."low_stock_threshold"`;
      and.push({ id: { in: ids.map((r) => r.id) } });
    }
    const where: Prisma.ProductWhereInput = { AND: and };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = {
      updated: [{ updatedAt: 'desc' as const }],
      name: [{ name: 'asc' as const }],
      price: [{ minPrice: 'asc' as const }],
      stock: [{ availableStock: 'asc' as const }],
      sold: [{ soldCount: 'desc' as const }],
    }[q.sort];

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [...orderBy, { id: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          category: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
          images: { orderBy: { position: 'asc' }, take: 1, select: { url: true } },
          _count: { select: { variants: true } },
        },
      }),
    ]);
    const low = rows.length
      ? await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT DISTINCT v."product_id" AS id FROM "inventory" i
        JOIN "product_variants" v ON v."id" = i."variant_id" AND v."is_active"
        WHERE v."product_id" IN (${Prisma.join(rows.map((r) => r.id))})
          AND i."stock" - i."reserved" <= i."low_stock_threshold"`
      : [];
    const lowIds = new Set(low.map((r) => r.id));
    return {
      data: rows.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        sku: p.sku,
        status: p.status,
        isFeatured: p.isFeatured,
        imageUrl: p.images[0]?.url ?? null,
        category: p.category,
        brand: p.brand,
        minPrice: p.minPrice,
        variantCount: p._count.variants,
        availableStock: p.availableStock,
        lowStock: lowIds.has(p.id),
        soldCount: p.soldCount,
        updatedAt: p.updatedAt.toISOString(),
      })),
      meta: {
        page: q.page,
        pageSize: q.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      },
    };
  }

  async get(id: string): Promise<AdminProductDto> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!p) throw notFound();
    return toDto(p);
  }

  async create(input: ProductInput, actor: Actor): Promise<AdminProductDto> {
    await this.checkReferences(input, null);
    const slug = await resolveSlug(input.slug, input.name, (s) => this.slugTaken(s, null));
    const media = await this.resolveMedia(input);

    const id = await this.write(async (tx) => {
      const product = await tx.product.create({
        data: { ...productFields(input), slug, status: 'DRAFT' },
      });
      await this.syncVariants(tx, product.id, input.variants, [], actor);
      await this.syncImages(tx, product.id, input, [], media);
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'product.created',
          entityType: 'product',
          entityId: product.id,
          metadata: { sku: input.sku, name: input.name },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return product.id;
    });
    return this.get(id);
  }

  async update(id: string, input: ProductInput, actor: Actor): Promise<AdminProductDto> {
    const current = await this.prisma.product.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!current) throw notFound();
    if (
      input.expectedUpdatedAt &&
      new Date(input.expectedUpdatedAt).getTime() !== current.updatedAt.getTime()
    )
      throw new AppException(
        HttpStatus.CONFLICT,
        'STALE_PRODUCT',
        'Someone else saved this product after you opened it. Reload to see their changes, then make yours again.',
      );
    await this.checkReferences(input, current);
    const slug =
      input.slug === current.slug
        ? current.slug
        : await resolveSlug(input.slug, input.name, (s) => this.slugTaken(s, id));
    const media = await this.resolveMedia(input);

    const keptVariantIds = new Set(input.variants.flatMap((v) => (v.id ? [v.id] : [])));
    const unknownVariant = input.variants.findIndex(
      (v) => v.id && !current.variants.some((cv) => cv.id === v.id),
    );
    if (unknownVariant >= 0)
      throw invalid('A variant doesn’t belong to this product. Reload and try again.', [
        { path: `variants.${unknownVariant}`, message: 'Unknown variant' },
      ]);
    const unknownImage = input.images.findIndex(
      (i) => i.id && !current.images.some((ci) => ci.id === i.id),
    );
    if (unknownImage >= 0)
      throw invalid('An image doesn’t belong to this product. Reload and try again.', [
        { path: `images.${unknownImage}`, message: 'Unknown image' },
      ]);

    if (current.status === 'ACTIVE') {
      const active = input.variants.some((v) => v.isActive);
      if (!active)
        throw invalid('A live product needs at least one active variant.', [
          { path: 'variants', message: 'Keep at least one variant active, or unpublish first' },
        ]);
      if (!input.images.length)
        throw invalid('A live product needs at least one image.', [
          { path: 'images', message: 'Add an image, or unpublish first' },
        ]);
    }

    const changed = changedFields(current, input, slug);
    await this.write(async (tx) => {
      await tx.product.update({ where: { id }, data: { ...productFields(input), slug } });
      const removed = current.variants.filter((v) => !keptVariantIds.has(v.id));
      for (const v of removed) {
        if (v._count.orderItems > 0 || (v.inventory?.reserved ?? 0) > 0)
          await tx.productVariant.update({
            where: { id: v.id },
            data: { isActive: false, isDefault: false },
          });
        else await tx.productVariant.delete({ where: { id: v.id } });
      }
      await this.syncVariants(tx, id, input.variants, current.variants, actor);
      await this.syncImages(tx, id, input, current.images, media);
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'product.updated',
          entityType: 'product',
          entityId: id,
          metadata: { sku: input.sku, changed, variantsRemoved: removed.map((v) => v.sku) },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    if (current.status === 'ACTIVE') await this.revalidation.catalogChanged();
    return this.get(id);
  }

  async setStatus(id: string, status: ProductStatus, actor: Actor): Promise<AdminProductDto> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!p) throw notFound();
    if (p.status === status) return toDto(p);
    if (status === 'ACTIVE') {
      const problems: FieldError[] = [];
      if (!p.variants.some((v) => v.isActive))
        problems.push({ path: 'variants', message: 'Add at least one active variant' });
      if (!p.images.length) problems.push({ path: 'images', message: 'Add at least one image' });
      const category = await this.prisma.category.findUnique({ where: { id: p.categoryId } });
      if (!category?.isActive)
        problems.push({ path: 'categoryId', message: 'The category is hidden; show it first' });
      if (problems.length)
        throw invalid('This product isn’t ready to publish.', problems, 'NOT_PUBLISHABLE');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          status,
          ...(status === 'ACTIVE' && !p.publishedAt ? { publishedAt: new Date() } : {}),
        },
      });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'product.status_changed',
          entityType: 'product',
          entityId: id,
          metadata: { sku: p.sku, from: p.status, to: status },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    await this.revalidation.catalogChanged();
    return this.get(id);
  }

  /** Permanently deletes a product that was never ordered; others must be archived. */
  async remove(id: string, actor: Actor): Promise<void> {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { orderItems: true } } },
    });
    if (!p) throw notFound();
    if (p._count.orderItems > 0)
      throw new AppException(
        HttpStatus.CONFLICT,
        'PRODUCT_HAS_ORDERS',
        'This product has been ordered, so it can’t be deleted. Archive it instead to hide it from the store.',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.product.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'product.deleted',
          entityType: 'product',
          entityId: id,
          metadata: { sku: p.sku, name: p.name, status: p.status },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
    });
    if (p.status === 'ACTIVE') await this.revalidation.catalogChanged();
  }

  /** Copies a product as a new draft: fresh SKUs and slug, no stock, same images. */
  async duplicate(id: string, actor: Actor): Promise<AdminProductDto> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!p) throw notFound();
    const skuFree = async (sku: string) =>
      !(await this.prisma.product.findUnique({ where: { sku } })) &&
      !(await this.prisma.productVariant.findUnique({ where: { sku } }));
    let suffix = '';
    for (let n = 1; n < 100; n++) {
      const s = n === 1 ? '-COPY' : `-COPY${n}`;
      const all = [p.sku, ...p.variants.map((v) => v.sku)].map((k) => `${k.slice(0, 57)}${s}`);
      if ((await Promise.all(all.map(skuFree))).every(Boolean)) {
        suffix = s;
        break;
      }
    }
    if (!suffix)
      throw new AppException(
        HttpStatus.CONFLICT,
        'SKU_TAKEN',
        'Couldn’t find free SKUs for a copy.',
      );
    const sku = (k: string) => `${k.slice(0, 57)}${suffix}`;
    const name = `${p.name} (copy)`.slice(0, 200);
    const slug = await resolveSlug(undefined, name, (s) => this.slugTaken(s, null));

    const newId = await this.write(async (tx) => {
      const { id: _id, createdAt: _c, updatedAt: _u, variants, images, _count, ...rest } = p;
      const copy = await tx.product.create({
        data: {
          ...rest,
          specifications: rest.specifications as Prisma.InputJsonValue,
          attributes: rest.attributes as Prisma.InputJsonValue,
          name,
          slug,
          sku: sku(p.sku),
          status: 'DRAFT',
          publishedAt: null,
          isFeatured: false,
          minPrice: 0,
          minPriceMrp: 0,
          maxDiscountPct: 0,
          availableStock: 0,
          ratingAvg: 0,
          ratingCount: 0,
          soldCount: 0,
        },
      });
      const variantIds = new Map<string, string>();
      for (const v of variants) {
        const created = await tx.productVariant.create({
          data: {
            productId: copy.id,
            sku: sku(v.sku),
            name: v.name,
            options: v.options as Prisma.InputJsonValue,
            mrp: v.mrp,
            price: v.price,
            weightGrams: v.weightGrams,
            isDefault: v.isDefault,
            isActive: v.isActive,
            position: v.position,
            inventory: {
              create: { stock: 0, lowStockThreshold: v.inventory?.lowStockThreshold ?? 5 },
            },
          },
        });
        variantIds.set(v.id, created.id);
      }
      await tx.productImage.createMany({
        data: images.map((img) => ({
          productId: copy.id,
          variantId: img.variantId ? (variantIds.get(img.variantId) ?? null) : null,
          url: img.url,
          alt: img.alt,
          width: img.width,
          height: img.height,
          position: img.position,
        })),
      });
      await this.audit.record(
        {
          actorId: actor.userId,
          action: 'product.duplicated',
          entityType: 'product',
          entityId: copy.id,
          metadata: { from: p.id, sku: copy.sku },
          ip: actor.ip,
          userAgent: actor.userAgent,
        },
        tx,
      );
      return copy.id;
    });
    return this.get(newId);
  }

  // ------------------------------------------------------------------ helpers

  private async slugTaken(slug: string, exceptId: string | null): Promise<boolean> {
    const found = await this.prisma.product.findUnique({ where: { slug }, select: { id: true } });
    return Boolean(found && found.id !== exceptId);
  }

  /** Category/brand exist; product and variant SKUs are free (field-level errors). */
  private async checkReferences(input: ProductInput, current: ProductWithDetail | null) {
    const errors: FieldError[] = [];
    const [category, brand] = await Promise.all([
      this.prisma.category.findUnique({ where: { id: input.categoryId } }),
      input.brandId ? this.prisma.brand.findUnique({ where: { id: input.brandId } }) : null,
    ]);
    if (!category) errors.push({ path: 'categoryId', message: 'Choose a category' });
    if (input.brandId && !brand) errors.push({ path: 'brandId', message: 'Choose a brand' });

    const productId = current?.id ?? '';
    const skuOwner = await this.prisma.product.findUnique({
      where: { sku: input.sku },
      select: { id: true },
    });
    if (skuOwner && skuOwner.id !== productId)
      errors.push({ path: 'sku', message: 'Another product uses this SKU' });
    const clashes = await this.prisma.productVariant.findMany({
      where: { sku: { in: input.variants.map((v) => v.sku) }, productId: { not: productId } },
      select: { sku: true },
    });
    const clash = new Set(clashes.map((c) => c.sku));
    input.variants.forEach((v, i) => {
      if (clash.has(v.sku))
        errors.push({ path: `variants.${i}.sku`, message: 'Another product uses this SKU' });
    });
    if (errors.length)
      throw new AppException(
        errors.some((e) => e.message.includes('SKU'))
          ? HttpStatus.CONFLICT
          : HttpStatus.UNPROCESSABLE_ENTITY,
        errors.some((e) => e.message.includes('SKU')) ? 'SKU_TAKEN' : 'VALIDATION_FAILED',
        'Some of the information provided is not valid.',
        errors,
      );
  }

  private async resolveMedia(input: ProductInput) {
    const ids = input.images.flatMap((i) => (i.mediaId ? [i.mediaId] : []));
    if (!ids.length) return new Map<string, { url: string; width: number; height: number }>();
    const assets = await this.prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
    const byId = new Map(
      assets.map((a) => [a.id, { url: a.url, width: a.width ?? 0, height: a.height ?? 0 }]),
    );
    const missing = input.images.findIndex((i) => i.mediaId && !byId.has(i.mediaId));
    if (missing >= 0)
      throw invalid('An uploaded image could not be found. Upload it again.', [
        { path: `images.${missing}`, message: 'Upload this image again' },
      ]);
    return byId;
  }

  private async syncVariants(
    tx: Tx,
    productId: string,
    variants: VariantInput[],
    existing: ProductWithDetail['variants'],
    actor: Actor,
  ) {
    const byId = new Map(existing.map((v) => [v.id, v]));
    // The partial unique index allows one default per product: clear, then set.
    await tx.productVariant.updateMany({ where: { productId }, data: { isDefault: false } });
    // The flagged active variant, else the first active one, else the first.
    const flagged = variants.findIndex((v) => v.isDefault && v.isActive);
    const chosen =
      flagged >= 0
        ? flagged
        : Math.max(
            variants.findIndex((v) => v.isActive),
            0,
          );
    // SKUs may be swapped between this product's variants: park renamed ones first.
    for (const v of variants)
      if (v.id && byId.get(v.id) && byId.get(v.id)!.sku !== v.sku)
        await tx.productVariant.update({ where: { id: v.id }, data: { sku: `~${v.id}` } });

    for (const [position, v] of variants.entries()) {
      const data = {
        sku: v.sku,
        name: v.name,
        options: v.options,
        mrp: v.mrp,
        price: v.price,
        weightGrams: v.weightGrams,
        isActive: v.isActive,
        isDefault: position === chosen,
        position,
      };
      const prev = v.id ? byId.get(v.id) : undefined;
      if (prev) {
        await tx.productVariant.update({ where: { id: prev.id }, data });
        if (prev.inventory)
          await tx.inventory.update({
            where: { variantId: prev.id },
            data: { lowStockThreshold: v.lowStockThreshold },
          });
        else
          await tx.inventory.create({
            data: { variantId: prev.id, lowStockThreshold: v.lowStockThreshold },
          });
      } else {
        const created = await tx.productVariant.create({
          data: {
            ...data,
            productId,
            inventory: {
              create: { stock: v.initialStock, lowStockThreshold: v.lowStockThreshold },
            },
          },
        });
        if (v.initialStock > 0)
          await tx.inventoryTransaction.create({
            data: {
              variantId: created.id,
              type: 'ADJUSTMENT',
              quantity: v.initialStock,
              stockAfter: v.initialStock,
              reservedAfter: 0,
              reason: 'Opening stock',
              actorId: actor.userId,
            },
          });
      }
    }
  }

  private async syncImages(
    tx: Tx,
    productId: string,
    input: ProductInput,
    existing: ProductWithDetail['images'],
    media: Map<string, { url: string; width: number; height: number }>,
  ) {
    const kept = new Set(input.images.flatMap((i) => (i.id ? [i.id] : [])));
    const drop = existing.filter((i) => !kept.has(i.id)).map((i) => i.id);
    if (drop.length) await tx.productImage.deleteMany({ where: { id: { in: drop } } });
    const variants = await tx.productVariant.findMany({
      where: { productId },
      select: { id: true, sku: true },
    });
    const variantBySku = new Map(variants.map((v) => [v.sku, v.id]));
    for (const [position, img] of input.images.entries()) {
      const variantId = img.variantSku ? (variantBySku.get(img.variantSku) ?? null) : null;
      if (img.id)
        await tx.productImage.update({
          where: { id: img.id },
          data: { alt: img.alt, position, variantId },
        });
      else {
        const m = media.get(img.mediaId!)!;
        await tx.productImage.create({
          data: {
            productId,
            url: m.url,
            width: m.width,
            height: m.height,
            alt: img.alt,
            position,
            variantId,
          },
        });
      }
    }
  }

  /** Runs a catalogue write, translating a SKU/slug race into a clear 409. */
  private async write<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, { timeout: 20_000 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = String((err.meta?.target as string[] | string | undefined) ?? '');
        throw new AppException(
          HttpStatus.CONFLICT,
          target.includes('slug') ? 'SLUG_TAKEN' : 'SKU_TAKEN',
          target.includes('slug')
            ? 'This URL is already used by another product.'
            : 'A SKU is already used by another product.',
        );
      }
      throw err;
    }
  }
}

function productFields(input: ProductInput) {
  return {
    name: input.name,
    sku: input.sku,
    shortDescription: input.shortDescription,
    description: input.description,
    categoryId: input.categoryId,
    brandId: input.brandId,
    isFeatured: input.isFeatured,
    taxRate: input.taxRate,
    hsnCode: input.hsnCode,
    highlights: input.highlights,
    tags: input.tags,
    specifications: input.specifications,
    weightGrams: input.weightGrams,
    lengthMm: input.lengthMm,
    widthMm: input.widthMm,
    heightMm: input.heightMm,
    videoUrl: input.videoUrl,
    shippingInfo: input.shippingInfo,
    returnInfo: input.returnInfo,
    warrantyInfo: input.warrantyInfo,
    isReturnable: input.isReturnable,
    returnWindowDays: input.returnWindowDays,
    isCodAvailable: input.isCodAvailable,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
  };
}

/** Names of top-level fields that differ, for the audit trail. */
function changedFields(current: ProductWithDetail, input: ProductInput, slug: string): string[] {
  const next = { ...productFields(input), slug } as Record<string, unknown>;
  const prev = current as unknown as Record<string, unknown>;
  const changed = Object.keys(next).filter(
    (k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null),
  );
  const variantSig = (v: { sku: string; price: number; mrp: number; isActive: boolean }) =>
    `${v.sku}:${v.price}:${v.mrp}:${v.isActive}`;
  if (current.variants.map(variantSig).join('|') !== input.variants.map(variantSig).join('|'))
    changed.push('variants');
  if (current.images.length !== input.images.length || input.images.some((i) => !i.id))
    changed.push('images');
  return changed;
}

export function toDto(p: ProductWithDetail): AdminProductDto {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    status: p.status,
    shortDescription: p.shortDescription,
    description: p.description,
    categoryId: p.categoryId,
    brandId: p.brandId,
    isFeatured: p.isFeatured,
    taxRate: p.taxRate,
    hsnCode: p.hsnCode,
    highlights: p.highlights,
    tags: p.tags,
    specifications: (p.specifications as { label: string; value: string }[]) ?? [],
    weightGrams: p.weightGrams,
    lengthMm: p.lengthMm,
    widthMm: p.widthMm,
    heightMm: p.heightMm,
    videoUrl: p.videoUrl,
    shippingInfo: p.shippingInfo,
    returnInfo: p.returnInfo,
    warrantyInfo: p.warrantyInfo,
    isReturnable: p.isReturnable,
    returnWindowDays: p.returnWindowDays,
    isCodAvailable: p.isCodAvailable,
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    variants: p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      options: (v.options as Record<string, string>) ?? {},
      mrp: v.mrp,
      price: v.price,
      weightGrams: v.weightGrams,
      isDefault: v.isDefault,
      isActive: v.isActive,
      stock: v.inventory?.stock ?? 0,
      reserved: v.inventory?.reserved ?? 0,
      lowStockThreshold: v.inventory?.lowStockThreshold ?? 5,
      hasOrders: v._count.orderItems > 0,
    })),
    images: p.images.map((i) => ({
      id: i.id,
      url: i.url,
      alt: i.alt,
      width: i.width,
      height: i.height,
      variantSku: i.variant?.sku ?? null,
    })),
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    hasOrders: p._count.orderItems > 0,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    soldCount: p.soldCount,
  };
}
