import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ImportRowIssue, ProductImportResultDto } from '@seshakart/types';
import { GST_RATES, PRODUCT_STATUSES, skuSchema, slugSchema, slugify } from '@seshakart/validation';
import { AuditService } from '../../audit/audit.service';
import { RevalidationService } from '../../cache/revalidation.service';
import { AppException } from '../../common/filters/all-exceptions.filter';
import { PrismaService } from '../../database/prisma.service';
import type { Actor } from '../actor';
import { CsvError, parseCsv, toCsv, unescapeFormula } from './csv';

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;

/**
 * One row per variant. Product columns repeat on each of a product's rows (they
 * may be left blank after the first). Prices are in rupees; lists use " | ".
 */
export const CSV_COLUMNS = [
  'product_sku',
  'product_name',
  'slug',
  'status',
  'category_slug',
  'brand_slug',
  'tax_rate',
  'hsn_code',
  'short_description',
  'description',
  'highlights',
  'tags',
  'is_featured',
  'is_cod_available',
  'is_returnable',
  'return_window_days',
  'meta_title',
  'meta_description',
  'variant_sku',
  'variant_name',
  'options',
  'mrp',
  'price',
  'stock',
  'low_stock_threshold',
  'variant_active',
] as const;
type Column = (typeof CSV_COLUMNS)[number];

type Cells = Partial<Record<Column, string>>;

interface ProductPlan {
  sku: string;
  line: number;
  existingId: string | null;
  data: Record<string, unknown>;
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  changed: boolean;
  variants: VariantPlan[];
}
interface VariantPlan {
  sku: string;
  line: number;
  existingId: string | null;
  data: Record<string, unknown>;
  stock?: number;
  threshold?: number;
  changed: boolean;
}

const rupees = (s: string): number | null => {
  const clean = s.replace(/[,₹\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
};
const toRupees = (paise: number) => (paise / 100).toFixed(2);
const bool = (s: string): boolean | null =>
  /^(true|yes|y|1)$/i.test(s) ? true : /^(false|no|n|0)$/i.test(s) ? false : null;
const list = (s: string) =>
  s
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
const parseOptions = (s: string): Record<string, string> | null => {
  const out: Record<string, string> = {};
  for (const part of list(s)) {
    const m = /^([^:]{1,40}):\s*(.{1,60})$/.exec(part);
    if (!m) return null;
    out[m[1]!.trim()] = m[2]!.trim();
  }
  return Object.keys(out).length <= 3 ? out : null;
};

/** Catalogue CSV export and validated, all-or-nothing import. */
@Injectable()
export class ProductCsvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly revalidation: RevalidationService,
  ) {}

  async export(): Promise<string> {
    const products = await this.prisma.product.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        category: { select: { slug: true } },
        brand: { select: { slug: true } },
        variants: { orderBy: { position: 'asc' }, include: { inventory: true } },
      },
    });
    const rows: (string | number | null)[][] = [[...CSV_COLUMNS]];
    for (const p of products)
      for (const v of p.variants)
        rows.push([
          p.sku,
          p.name,
          p.slug,
          p.status,
          p.category.slug,
          p.brand?.slug ?? '',
          p.taxRate,
          p.hsnCode ?? '',
          p.shortDescription,
          p.description,
          p.highlights.join(' | '),
          p.tags.join(' | '),
          String(p.isFeatured),
          String(p.isCodAvailable),
          String(p.isReturnable),
          p.returnWindowDays,
          p.metaTitle ?? '',
          p.metaDescription ?? '',
          v.sku,
          v.name,
          Object.entries((v.options as Record<string, string>) ?? {})
            .map(([k, val]) => `${k}: ${val}`)
            .join(' | '),
          toRupees(v.mrp),
          toRupees(v.price),
          v.inventory?.stock ?? 0,
          v.inventory?.lowStockThreshold ?? 5,
          String(v.isActive),
        ]);
    return toCsv(rows);
  }

  async import(
    buffer: Buffer | undefined,
    dryRun: boolean,
    actor: Actor,
  ): Promise<ProductImportResultDto> {
    if (!buffer?.length)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FILE_REQUIRED',
        'Choose a CSV file to import.',
      );
    if (buffer.length > MAX_IMPORT_BYTES)
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'FILE_TOO_LARGE',
        'CSV files must be 2 MB or smaller.',
      );
    const text = buffer.toString('utf8');
    if (text.includes('�'))
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_ENCODING',
        'Save the file as CSV UTF-8 and try again.',
      );

    const errors: ImportRowIssue[] = [];
    let parsed: { line: number; fields: string[] }[];
    try {
      parsed = parseCsv(text);
    } catch (err) {
      if (err instanceof CsvError)
        return this.result(dryRun, 0, [], [{ line: err.line, message: err.message }]);
      throw err;
    }
    const [header, ...body] = parsed;
    if (!header) return this.result(dryRun, 0, [], [{ line: 1, message: 'The file is empty.' }]);
    const cols = header.fields.map((h) => h.trim().toLowerCase());
    const unknown = cols.filter((c) => !(CSV_COLUMNS as readonly string[]).includes(c));
    if (unknown.length)
      errors.push({
        line: 1,
        message: `Unknown column${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`,
      });
    const dup = cols.filter((c, i) => cols.indexOf(c) !== i);
    if (dup.length) errors.push({ line: 1, message: `Duplicate column: ${dup.join(', ')}` });
    for (const required of ['product_sku', 'variant_sku'] as const)
      if (!cols.includes(required))
        errors.push({ line: 1, message: `Missing column: ${required}` });
    if (body.length > MAX_IMPORT_ROWS)
      errors.push({
        line: 1,
        message: `At most ${MAX_IMPORT_ROWS} rows per file (this one has ${body.length}).`,
      });
    if (errors.length) return this.result(dryRun, body.length, [], errors);

    const rows = body.map((r) => {
      const cells: Cells = {};
      cols.forEach((c, i) => (cells[c as Column] = unescapeFormula((r.fields[i] ?? '').trim())));
      if (r.fields.length > cols.length)
        errors.push({
          line: r.line,
          message: `Has ${r.fields.length} values but the header has ${cols.length} columns`,
        });
      return { line: r.line, cells };
    });

    const plans = await this.plan(rows, cols as Column[], errors);
    const result = this.result(dryRun, rows.length, plans, errors);
    if (dryRun || errors.length) return result;

    await this.prisma.$transaction(
      async (tx) => {
        for (const p of plans) await this.applyProduct(tx, p, actor);
        await this.audit.record(
          {
            actorId: actor.userId,
            action: 'product.imported',
            entityType: 'product',
            metadata: { rows: rows.length, products: result.products, variants: result.variants },
            ip: actor.ip,
            userAgent: actor.userAgent,
          },
          tx,
        );
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    await this.revalidation.catalogChanged();
    return { ...result, applied: true };
  }

  private result(
    dryRun: boolean,
    rows: number,
    plans: ProductPlan[],
    errors: ImportRowIssue[],
  ): ProductImportResultDto {
    const count = <T extends { existingId: string | null; changed: boolean }>(items: T[]) => ({
      create: items.filter((i) => !i.existingId).length,
      update: items.filter((i) => i.existingId && i.changed).length,
      unchanged: items.filter((i) => i.existingId && !i.changed).length,
    });
    return {
      dryRun,
      rows,
      products: count(plans),
      variants: count(plans.flatMap((p) => p.variants)),
      errors: errors.sort((a, b) => a.line - b.line).slice(0, 200),
      applied: false,
    };
  }

  /** Validates every row against the file and the database; builds the change plan. */
  private async plan(
    rows: { line: number; cells: Cells }[],
    cols: Column[],
    errors: ImportRowIssue[],
  ): Promise<ProductPlan[]> {
    const has = (c: Column) => cols.includes(c);
    const err = (line: number, column: Column | undefined, message: string) =>
      errors.push({ line, ...(column ? { column } : {}), message });

    // Group rows by product SKU (normalised as the API stores it).
    const groups = new Map<string, { line: number; cells: Cells }[]>();
    for (const r of rows) {
      const sku = skuSchema.safeParse(r.cells.product_sku ?? '');
      if (!sku.success) {
        err(r.line, 'product_sku', sku.error.issues[0]!.message);
        continue;
      }
      groups.set(sku.data, [...(groups.get(sku.data) ?? []), r]);
    }

    const productSkus = [...groups.keys()];
    const variantSkus = rows.flatMap((r) => {
      const s = skuSchema.safeParse(r.cells.variant_sku ?? '');
      return s.success ? [s.data] : [];
    });
    const [existingProducts, existingVariants, categories, brands] = await Promise.all([
      this.prisma.product.findMany({
        where: { sku: { in: productSkus } },
        include: { _count: { select: { images: true } } },
      }),
      this.prisma.productVariant.findMany({
        where: { sku: { in: variantSkus } },
        include: { inventory: true, product: { select: { sku: true } } },
      }),
      this.prisma.category.findMany({ select: { id: true, slug: true } }),
      this.prisma.brand.findMany({ select: { id: true, slug: true } }),
    ]);
    const productBySku = new Map(existingProducts.map((p) => [p.sku, p]));
    const variantBySku = new Map(existingVariants.map((v) => [v.sku, v]));
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const brandBySlug = new Map(brands.map((b) => [b.slug, b.id]));
    const seenVariant = new Map<string, number>();
    const slugsInFile = new Map<string, string>();

    const plans: ProductPlan[] = [];
    for (const [sku, group] of groups) {
      const first = group[0]!;
      const existing = productBySku.get(sku) ?? null;
      // Product columns: the first non-blank value wins; a different value later is an error.
      const value = (c: Column): string | undefined => {
        if (!has(c)) return undefined;
        let found: { v: string; line: number } | undefined;
        for (const r of group) {
          const v = r.cells[c] ?? '';
          if (!v) continue;
          if (!found) found = { v, line: r.line };
          else if (v !== found.v)
            err(r.line, c, `Differs from line ${found.line} for the same product`);
        }
        return found?.v ?? '';
      };

      const data: Record<string, unknown> = {};
      const name = value('product_name');
      if (name !== undefined) {
        if (name.length < 3 || name.length > 200)
          err(first.line, 'product_name', 'Enter a name of 3–200 characters');
        else data.name = name;
      } else if (!existing) err(first.line, 'product_name', 'Required for a new product');
      if (!existing && name === '') err(first.line, 'product_name', 'Required for a new product');

      const slugCell = value('slug');
      if (slugCell) {
        const s = slugSchema.safeParse(slugCell);
        if (!s.success) err(first.line, 'slug', s.error.issues[0]!.message);
        else data.slug = s.data;
      }
      const category = value('category_slug');
      if (category) {
        const id = categoryBySlug.get(category);
        if (!id) err(first.line, 'category_slug', `No category with the URL "${category}"`);
        else data.categoryId = id;
      } else if (!existing) err(first.line, 'category_slug', 'Required for a new product');
      const brand = value('brand_slug');
      if (brand !== undefined) {
        if (!brand) data.brandId = null;
        else if (!brandBySlug.has(brand))
          err(first.line, 'brand_slug', `No brand with the URL "${brand}"`);
        else data.brandId = brandBySlug.get(brand);
      }
      const tax = value('tax_rate');
      if (tax) {
        const n = Number(tax.replace('%', ''));
        if (!(GST_RATES as readonly number[]).includes(n))
          err(first.line, 'tax_rate', `GST must be one of ${GST_RATES.join(', ')}`);
        else data.taxRate = n;
      }
      const hsn = value('hsn_code');
      if (hsn !== undefined) {
        if (hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(hsn))
          err(first.line, 'hsn_code', 'HSN code must be 4, 6 or 8 digits');
        else data.hsnCode = hsn || null;
      }
      const textCol = (c: Column, field: string, max: number, nullable: boolean) => {
        const v = value(c);
        if (v === undefined) return;
        if (v.length > max) err(first.line, c, `At most ${max} characters`);
        else data[field] = v || (nullable ? null : '');
      };
      textCol('short_description', 'shortDescription', 300, false);
      textCol('description', 'description', 10_000, false);
      textCol('meta_title', 'metaTitle', 70, true);
      textCol('meta_description', 'metaDescription', 160, true);
      const listCol = (c: Column, field: string, max: number, itemMax: number, lower = false) => {
        const v = value(c);
        if (v === undefined) return;
        const items = list(v).map((x) => (lower ? x.toLowerCase() : x));
        if (items.length > max || items.some((x) => x.length > itemMax))
          err(first.line, c, `At most ${max} items of up to ${itemMax} characters`);
        else data[field] = lower ? [...new Set(items)] : items;
      };
      listCol('highlights', 'highlights', 10, 200);
      listCol('tags', 'tags', 20, 40, true);
      for (const [c, field] of [
        ['is_featured', 'isFeatured'],
        ['is_cod_available', 'isCodAvailable'],
        ['is_returnable', 'isReturnable'],
      ] as const) {
        const v = value(c);
        if (!v) continue;
        const b = bool(v);
        if (b === null) err(first.line, c, 'Use true or false');
        else data[field] = b;
      }
      const days = value('return_window_days');
      if (days) {
        const n = Number(days);
        if (!Number.isInteger(n) || n < 0 || n > 90)
          err(first.line, 'return_window_days', 'Enter 0–90 days');
        else data.returnWindowDays = n;
      }
      let status: ProductPlan['status'];
      const st = value('status')?.toUpperCase();
      if (st) {
        if (!(PRODUCT_STATUSES as readonly string[]).includes(st))
          err(first.line, 'status', 'Use DRAFT, ACTIVE or ARCHIVED');
        else status = st as ProductPlan['status'];
      }
      if (status === 'ACTIVE' && existing?.status !== 'ACTIVE' && !(existing?._count.images ?? 0))
        err(first.line, 'status', 'Add images in the admin before publishing; import it as DRAFT');

      // Slug: explicit must be free (or already this product's); new products get one generated.
      if (!existing && !data.slug && typeof data.name === 'string')
        data.slug = slugify(data.name) || sku.toLowerCase();
      if (typeof data.slug === 'string' && data.slug !== existing?.slug) {
        const owner = await this.prisma.product.findUnique({
          where: { slug: data.slug },
          select: { sku: true },
        });
        const fileOwner = slugsInFile.get(data.slug);
        if ((owner && owner.sku !== sku) || (fileOwner && fileOwner !== sku)) {
          if (slugCell) err(first.line, 'slug', `The URL "${data.slug}" is already used`);
          else
            data.slug =
              `${data.slug.slice(0, 150)}-${sku.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(
                0,
                160,
              );
        }
        slugsInFile.set(data.slug as string, sku);
      }

      // Variants.
      const variants: VariantPlan[] = [];
      for (const r of group) {
        const vs = skuSchema.safeParse(r.cells.variant_sku ?? '');
        if (!vs.success) {
          err(r.line, 'variant_sku', vs.error.issues[0]!.message);
          continue;
        }
        const vsku = vs.data;
        if (seenVariant.has(vsku)) {
          err(r.line, 'variant_sku', `Also on line ${seenVariant.get(vsku)}`);
          continue;
        }
        seenVariant.set(vsku, r.line);
        const ev = variantBySku.get(vsku) ?? null;
        if (ev && ev.product.sku !== sku) {
          err(r.line, 'variant_sku', `Belongs to product ${ev.product.sku}`);
          continue;
        }
        const vd: Record<string, unknown> = {};
        const c = r.cells;
        if (has('variant_name')) {
          const n = c.variant_name ?? '';
          if (!n || n.length > 120)
            err(r.line, 'variant_name', 'Enter a name of up to 120 characters');
          else vd.name = n;
        } else if (!ev) err(r.line, 'variant_name', 'Required for a new variant');
        if (has('options')) {
          const o = parseOptions(c.options ?? '');
          if (!o) err(r.line, 'options', 'Use "Name: value | Name: value" (at most 3)');
          else vd.options = o;
        }
        for (const col of ['mrp', 'price'] as const) {
          if (!has(col)) {
            if (!ev) err(r.line, col, 'Required for a new variant');
            continue;
          }
          const p = rupees(c[col] ?? '');
          if (p === null || p < 100 || p > 1_000_000_000)
            err(r.line, col, 'Enter an amount in rupees, e.g. 1299 or 1299.50');
          else vd[col] = p;
        }
        const mrp = (vd.mrp as number | undefined) ?? ev?.mrp;
        const price = (vd.price as number | undefined) ?? ev?.price;
        if (mrp !== undefined && price !== undefined && mrp < price)
          err(r.line, 'mrp', 'MRP can’t be lower than the price');
        if (has('variant_active') && c.variant_active) {
          const b = bool(c.variant_active);
          if (b === null) err(r.line, 'variant_active', 'Use true or false');
          else vd.isActive = b;
        }
        let stock: number | undefined;
        if (has('stock') && c.stock) {
          const n = Number(c.stock);
          if (!Number.isInteger(n) || n < 0 || n > 1_000_000)
            err(r.line, 'stock', 'Enter a whole number, 0 or more');
          else if (ev?.inventory && n < ev.inventory.reserved)
            err(
              r.line,
              'stock',
              `${ev.inventory.reserved} are reserved for open orders; stock can’t be lower`,
            );
          else stock = n;
        }
        let threshold: number | undefined;
        if (has('low_stock_threshold') && c.low_stock_threshold) {
          const n = Number(c.low_stock_threshold);
          if (!Number.isInteger(n) || n < 0 || n > 100_000)
            err(r.line, 'low_stock_threshold', 'Enter a whole number, 0 or more');
          else threshold = n;
        }
        const changed =
          !ev ||
          Object.entries(vd).some(
            ([k, v]) => JSON.stringify((ev as Record<string, unknown>)[k]) !== JSON.stringify(v),
          ) ||
          (stock !== undefined && stock !== ev.inventory?.stock) ||
          (threshold !== undefined && threshold !== ev.inventory?.lowStockThreshold);
        variants.push({
          sku: vsku,
          line: r.line,
          existingId: ev?.id ?? null,
          data: vd,
          stock,
          threshold,
          changed,
        });
      }
      if (existing && status === 'ACTIVE' && existing.status !== 'ACTIVE') {
        const activeAfter = variants.some((v) => v.data.isActive !== false);
        if (!activeAfter) err(first.line, 'status', 'A live product needs an active variant');
      }

      const productChanged =
        !existing ||
        Object.entries(data).some(
          ([k, v]) =>
            JSON.stringify((existing as Record<string, unknown>)[k]) !== JSON.stringify(v),
        ) ||
        (status !== undefined && status !== existing.status);
      plans.push({
        sku,
        line: first.line,
        existingId: existing?.id ?? null,
        data,
        status,
        changed: productChanged,
        variants,
      });
    }
    return plans;
  }

  private async applyProduct(tx: Prisma.TransactionClient, p: ProductPlan, actor: Actor) {
    let productId = p.existingId;
    const statusData = p.status
      ? { status: p.status, ...(p.status === 'ACTIVE' ? { publishedAt: new Date() } : {}) }
      : {};
    if (!productId) {
      const created = await tx.product.create({
        data: {
          ...(p.data as Prisma.ProductUncheckedCreateInput),
          sku: p.sku,
          status: p.status ?? 'DRAFT',
        },
      });
      productId = created.id;
    } else if (p.changed) {
      const current = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { publishedAt: true },
      });
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(p.data as Prisma.ProductUncheckedUpdateInput),
          ...statusData,
          ...(current.publishedAt && p.status === 'ACTIVE'
            ? { publishedAt: current.publishedAt }
            : {}),
        },
      });
    }
    const count = await tx.productVariant.count({ where: { productId } });
    for (const [i, v] of p.variants.entries()) {
      if (!v.existingId) {
        const created = await tx.productVariant.create({
          data: {
            ...(v.data as Prisma.ProductVariantUncheckedCreateInput),
            productId,
            sku: v.sku,
            position: count + i,
            isDefault: count === 0 && i === 0,
            inventory: { create: { stock: v.stock ?? 0, lowStockThreshold: v.threshold ?? 5 } },
          },
        });
        if (v.stock)
          await tx.inventoryTransaction.create({
            data: {
              variantId: created.id,
              type: 'ADJUSTMENT',
              quantity: v.stock,
              stockAfter: v.stock,
              reservedAfter: 0,
              reason: 'CSV import (opening stock)',
              actorId: actor.userId,
            },
          });
        continue;
      }
      if (!v.changed) continue;
      if (Object.keys(v.data).length)
        await tx.productVariant.update({
          where: { id: v.existingId },
          data: v.data as Prisma.ProductVariantUncheckedUpdateInput,
        });
      if (v.threshold !== undefined)
        await tx.inventory.update({
          where: { variantId: v.existingId },
          data: { lowStockThreshold: v.threshold },
        });
      if (v.stock !== undefined) {
        const [cur] = await tx.$queryRaw<{ stock: number; reserved: number }[]>`
          SELECT "stock", "reserved" FROM "inventory" WHERE "variant_id" = ${v.existingId} FOR UPDATE`;
        if (!cur || v.stock < cur.reserved)
          throw new AppException(
            HttpStatus.CONFLICT,
            'BELOW_RESERVED',
            `Line ${v.line}: stock can’t go below what is reserved for open orders. Check the file again.`,
          );
        const [updated] = await tx.$queryRaw<{ stock: number; reserved: number }[]>`
          UPDATE "inventory" SET "stock" = ${v.stock}, "updated_at" = now()
          WHERE "variant_id" = ${v.existingId} RETURNING "stock", "reserved"`;
        const r = { ...updated!, before: cur.stock };
        if (r.stock !== r.before)
          await tx.inventoryTransaction.create({
            data: {
              variantId: v.existingId,
              type: 'ADJUSTMENT',
              quantity: r.stock - r.before,
              stockAfter: r.stock,
              reservedAfter: r.reserved,
              reason: 'CSV import',
              actorId: actor.userId,
            },
          });
      }
    }
  }
}
