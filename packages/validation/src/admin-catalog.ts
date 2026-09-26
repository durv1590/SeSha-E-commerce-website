import { z } from 'zod';
import { idSchema } from './cart';
import { paiseSchema, slugSchema } from './primitives';

/**
 * Staff catalogue management: products (with variants and images), categories,
 * brands and stock. Shared by the admin forms and the API, so both enforce the
 * same rules; the database adds CHECK constraints as a last line of defence.
 */

export const GST_RATES = [0, 3, 5, 12, 18, 28] as const;
export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;
export type ProductStatusValue = (typeof PRODUCT_STATUSES)[number];

export const MAX_VARIANTS = 50;
export const MAX_PRODUCT_IMAGES = 12;

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const optionalInt = (min: number, max: number) =>
  z
    .number()
    .int()
    .min(min)
    .max(max)
    .nullish()
    .transform((v) => v ?? null);

/** SKU: letters, digits, hyphen, underscore, dot and slash; stored upper-case. */
export const skuSchema = z
  .string()
  .trim()
  .min(2, 'SKU must be at least 2 characters')
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use letters, numbers, - _ . / only')
  .transform((v) => v.toUpperCase());

/** HSN (goods) code: 4, 6 or 8 digits. */
export const hsnSchema = z
  .string()
  .trim()
  .regex(/^(\d{4}|\d{6}|\d{8})$/, 'HSN code must be 4, 6 or 8 digits')
  .nullish()
  .or(z.literal('').transform(() => null))
  .transform((v) => v ?? null);

/** Turns a name into a URL slug ("Men's T-Shirt (Blue)" → "mens-t-shirt-blue"). */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)
    .replace(/-+$/, '');
}

const optionsSchema = z
  .record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(60))
  .refine((o) => Object.keys(o).length <= 3, 'At most 3 options per variant')
  .default({});

export const variantInputSchema = z
  .object({
    /** Present for an existing variant; absent for a new one. */
    id: idSchema.optional(),
    sku: skuSchema,
    name: text(120).min(1, 'Enter a variant name'),
    options: optionsSchema,
    mrp: paiseSchema.min(100, 'MRP must be at least ₹1'),
    price: paiseSchema.min(100, 'Price must be at least ₹1'),
    weightGrams: optionalInt(1, 100_000),
    isDefault: z.boolean().default(false),
    isActive: z.boolean().default(true),
    lowStockThreshold: z.number().int().min(0).max(100_000).default(5),
    /** Opening stock for a new variant. Existing stock changes go through adjustments. */
    initialStock: z.number().int().min(0).max(1_000_000).default(0),
  })
  .refine((v) => v.mrp >= v.price, {
    path: ['mrp'],
    message: 'MRP can’t be lower than the selling price',
  });
export type VariantInput = z.infer<typeof variantInputSchema>;

export const productImageInputSchema = z
  .object({
    /** An image already on this product… */
    id: idSchema.optional(),
    /** …or a freshly uploaded media asset. */
    mediaId: idSchema.optional(),
    alt: text(200).min(1, 'Describe the image for customers using screen readers'),
    /** Optional: show this image when the variant is selected. */
    variantSku: skuSchema.nullish().transform((v) => v ?? null),
  })
  .refine((i) => Boolean(i.id) !== Boolean(i.mediaId), 'Each image needs exactly one source');
export type ProductImageInput = z.infer<typeof productImageInputSchema>;

/** An image reference: an uploaded file (/api/media/…) or an https:// URL. */
export const assetUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (u) => /^\/api\/media\/[A-Za-z0-9/._-]+$/.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u),
    'Upload an image or use an https:// link',
  )
  .nullish()
  .or(z.literal('').transform(() => null))
  .transform((v) => v ?? null);

const specificationSchema = z.object({
  label: text(60).min(1),
  value: text(300).min(1),
});

export const productInputSchema = z
  .object({
    name: text(200).min(3, 'Enter a product name of at least 3 characters'),
    /** Optional: generated from the name when left empty. */
    slug: slugSchema.optional().or(z.literal('').transform(() => undefined)),
    sku: skuSchema,
    shortDescription: text(300).default(''),
    description: text(10_000).default(''),
    categoryId: idSchema,
    brandId: idSchema.nullish().transform((v) => v ?? null),
    isFeatured: z.boolean().default(false),
    taxRate: z
      .number()
      .int()
      .refine((r) => (GST_RATES as readonly number[]).includes(r), 'Choose a GST rate'),
    hsnCode: hsnSchema,
    highlights: z.array(text(200).min(1)).max(10).default([]),
    tags: z
      .array(text(40).min(1).toLowerCase())
      .max(20)
      .default([])
      .transform((t) => [...new Set(t)]),
    specifications: z.array(specificationSchema).max(40).default([]),
    weightGrams: optionalInt(1, 100_000),
    lengthMm: optionalInt(1, 5_000),
    widthMm: optionalInt(1, 5_000),
    heightMm: optionalInt(1, 5_000),
    videoUrl: z
      .string()
      .trim()
      .url('Enter a full https:// link')
      .max(500)
      .refine((u) => u.startsWith('https://'), 'Use an https:// link')
      .nullish()
      .or(z.literal('').transform(() => null))
      .transform((v) => v ?? null),
    shippingInfo: optionalText(1000),
    returnInfo: optionalText(1000),
    warrantyInfo: optionalText(1000),
    isReturnable: z.boolean().default(true),
    returnWindowDays: z.number().int().min(0).max(90).default(7),
    isCodAvailable: z.boolean().default(true),
    metaTitle: optionalText(70),
    metaDescription: optionalText(160),
    variants: z
      .array(variantInputSchema)
      .min(1, 'Add at least one variant')
      .max(MAX_VARIANTS, `At most ${MAX_VARIANTS} variants`),
    images: z.array(productImageInputSchema).max(MAX_PRODUCT_IMAGES).default([]),
    /** Optimistic concurrency: the `updatedAt` the editor loaded (updates only). */
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .superRefine((p, ctx) => {
    const skus = new Map<string, number>();
    p.variants.forEach((v, i) => {
      if (skus.has(v.sku))
        ctx.addIssue({
          code: 'custom',
          path: ['variants', i, 'sku'],
          message: 'Each variant needs its own SKU',
        });
      skus.set(v.sku, i);
    });
    const defaults = p.variants.filter((v) => v.isDefault).length;
    if (defaults > 1)
      ctx.addIssue({
        code: 'custom',
        path: ['variants'],
        message: 'Only one variant can be the default',
      });
    p.images.forEach((img, i) => {
      if (img.variantSku && !skus.has(img.variantSku))
        ctx.addIssue({
          code: 'custom',
          path: ['images', i, 'variantSku'],
          message: 'This image is linked to a variant that isn’t in the list',
        });
    });
    const dims = [p.lengthMm, p.widthMm, p.heightMm].filter((d) => d !== null).length;
    if (dims !== 0 && dims !== 3)
      ctx.addIssue({
        code: 'custom',
        path: ['lengthMm'],
        message: 'Enter all three dimensions or none',
      });
  });
export type ProductInput = z.infer<typeof productInputSchema>;

export const productStatusSchema = z.object({ status: z.enum(PRODUCT_STATUSES) });

export const ADMIN_PRODUCT_SORTS = ['updated', 'name', 'price', 'stock', 'sold'] as const;

export const adminProductListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', ...PRODUCT_STATUSES]).default('all'),
  categoryId: idSchema.optional(),
  brandId: idSchema.optional(),
  stock: z.enum(['all', 'low', 'out']).default('all'),
  sort: z.enum(ADMIN_PRODUCT_SORTS).default('updated'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

// ----------------------------------------------------------------- categories

export const categoryInputSchema = z.object({
  name: text(80).min(2, 'Enter a name of at least 2 characters'),
  slug: slugSchema.optional().or(z.literal('').transform(() => undefined)),
  parentId: idSchema.nullish().transform((v) => v ?? null),
  description: optionalText(500),
  seoContent: optionalText(5000),
  imageUrl: assetUrlSchema,
  bannerUrl: assetUrlSchema,
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  metaTitle: optionalText(70),
  metaDescription: optionalText(160),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;

// --------------------------------------------------------------------- brands

export const brandInputSchema = z.object({
  name: text(80).min(1, 'Enter a brand name'),
  slug: slugSchema.optional().or(z.literal('').transform(() => undefined)),
  description: optionalText(500),
  logoUrl: assetUrlSchema,
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  metaTitle: optionalText(70),
  metaDescription: optionalText(160),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

// ------------------------------------------------------------------ inventory

export const inventoryListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  stock: z.enum(['all', 'low', 'out']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

export const STOCK_ADJUST_MODES = ['add', 'remove', 'set'] as const;

export const stockAdjustmentSchema = z
  .object({
    mode: z.enum(STOCK_ADJUST_MODES),
    quantity: z.number().int().min(0).max(1_000_000),
    reason: text(200).min(3, 'Say why the stock is changing'),
  })
  .refine((a) => a.mode === 'set' || a.quantity > 0, {
    path: ['quantity'],
    message: 'Enter a quantity of at least 1',
  });
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;

export const lowStockThresholdSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(100_000),
});

export const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const importQuerySchema = z.object({
  dryRun: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});
