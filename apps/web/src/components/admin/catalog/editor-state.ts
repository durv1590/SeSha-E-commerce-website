import type { AdminProductDto } from '@seshakart/types';
import { paiseToRupees, rupeesToPaise } from '@/lib/admin/money';

/**
 * Product editor state. Inputs hold text exactly as typed; `toPayload` converts to
 * the API's shape (paise, numbers, nulls) and reports fields it can't convert, so
 * the shared Zod schema then applies the same rules as the server.
 */

export interface VariantDraft {
  key: string;
  id?: string;
  sku: string;
  name: string;
  /** "Colour: Black | Size: M" */
  options: string;
  mrp: string;
  price: string;
  weightGrams: string;
  isDefault: boolean;
  isActive: boolean;
  lowStockThreshold: string;
  initialStock: string;
  /** Read-only facts about a saved variant. */
  stock?: number;
  reserved?: number;
  hasOrders?: boolean;
}

export interface ImageDraft {
  key: string;
  id?: string;
  mediaId?: string;
  url: string;
  alt: string;
  variantSku: string;
}

export interface SpecDraft {
  key: string;
  label: string;
  value: string;
}

export interface EditorState {
  name: string;
  slug: string;
  sku: string;
  shortDescription: string;
  description: string;
  categoryId: string;
  brandId: string;
  isFeatured: boolean;
  taxRate: string;
  hsnCode: string;
  highlights: string;
  tags: string;
  specifications: SpecDraft[];
  weightGrams: string;
  lengthMm: string;
  widthMm: string;
  heightMm: string;
  videoUrl: string;
  shippingInfo: string;
  returnInfo: string;
  warrantyInfo: string;
  isReturnable: boolean;
  returnWindowDays: string;
  isCodAvailable: boolean;
  metaTitle: string;
  metaDescription: string;
  variants: VariantDraft[];
  images: ImageDraft[];
}

let seq = 0;
export const newKey = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

export function formatOptions(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' | ');
}

/** Parses "Colour: Black | Size: M"; null when a part isn't "name: value". */
export function parseOptions(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of text
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const i = part.indexOf(':');
    if (i <= 0) return null;
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (!name || !value) return null;
    out[name] = value;
  }
  return out;
}

export function emptyVariant(isDefault = false): VariantDraft {
  return {
    key: newKey('v'),
    sku: '',
    name: '',
    options: '',
    mrp: '',
    price: '',
    weightGrams: '',
    isDefault,
    isActive: true,
    lowStockThreshold: '5',
    initialStock: '0',
  };
}

export function emptyState(categoryId = ''): EditorState {
  return {
    name: '',
    slug: '',
    sku: '',
    shortDescription: '',
    description: '',
    categoryId,
    brandId: '',
    isFeatured: false,
    taxRate: '18',
    hsnCode: '',
    highlights: '',
    tags: '',
    specifications: [],
    weightGrams: '',
    lengthMm: '',
    widthMm: '',
    heightMm: '',
    videoUrl: '',
    shippingInfo: '',
    returnInfo: '',
    warrantyInfo: '',
    isReturnable: true,
    returnWindowDays: '7',
    isCodAvailable: true,
    metaTitle: '',
    metaDescription: '',
    variants: [emptyVariant(true)],
    images: [],
  };
}

const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

export function fromProduct(p: AdminProductDto): EditorState {
  return {
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    shortDescription: p.shortDescription,
    description: p.description,
    categoryId: p.categoryId,
    brandId: p.brandId ?? '',
    isFeatured: p.isFeatured,
    taxRate: String(p.taxRate),
    hsnCode: p.hsnCode ?? '',
    highlights: p.highlights.join('\n'),
    tags: p.tags.join(', '),
    specifications: p.specifications.map((s) => ({ key: newKey('s'), ...s })),
    weightGrams: str(p.weightGrams),
    lengthMm: str(p.lengthMm),
    widthMm: str(p.widthMm),
    heightMm: str(p.heightMm),
    videoUrl: p.videoUrl ?? '',
    shippingInfo: p.shippingInfo ?? '',
    returnInfo: p.returnInfo ?? '',
    warrantyInfo: p.warrantyInfo ?? '',
    isReturnable: p.isReturnable,
    returnWindowDays: String(p.returnWindowDays),
    isCodAvailable: p.isCodAvailable,
    metaTitle: p.metaTitle ?? '',
    metaDescription: p.metaDescription ?? '',
    variants: p.variants.map((v) => ({
      key: v.id,
      id: v.id,
      sku: v.sku,
      name: v.name,
      options: formatOptions(v.options),
      mrp: paiseToRupees(v.mrp),
      price: paiseToRupees(v.price),
      weightGrams: str(v.weightGrams),
      isDefault: v.isDefault,
      isActive: v.isActive,
      lowStockThreshold: String(v.lowStockThreshold),
      initialStock: '0',
      stock: v.stock,
      reserved: v.reserved,
      hasOrders: v.hasOrders,
    })),
    images: p.images.map((i) => ({
      key: i.id,
      id: i.id,
      url: i.url,
      alt: i.alt,
      variantSku: i.variantSku ?? '',
    })),
  };
}

/** Converts editor text to the API payload; `errors` lists fields that aren't numbers. */
export function toPayload(s: EditorState): {
  payload: Record<string, unknown>;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};
  const int = (path: string, v: string, optional = true): number | null | undefined => {
    const t = v.trim();
    if (!t) return optional ? null : undefined;
    if (!/^\d+$/.test(t)) {
      errors[path] = 'Enter a whole number';
      return undefined;
    }
    return Number(t);
  };
  const money = (path: string, v: string): number | undefined => {
    const p = rupeesToPaise(v);
    if (p === null) {
      errors[path] = v.trim() ? 'Enter an amount like 1299 or 1299.50' : 'Enter an amount';
      return undefined;
    }
    return p;
  };

  const payload = {
    name: s.name,
    slug: s.slug.trim(),
    sku: s.sku,
    shortDescription: s.shortDescription,
    description: s.description,
    categoryId: s.categoryId,
    brandId: s.brandId || null,
    isFeatured: s.isFeatured,
    taxRate: Number(s.taxRate),
    hsnCode: s.hsnCode.trim() || null,
    highlights: s.highlights
      .split('\n')
      .map((h) => h.trim())
      .filter(Boolean),
    tags: s.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    specifications: s.specifications
      .filter((sp) => sp.label.trim() || sp.value.trim())
      .map(({ label, value }) => ({ label, value })),
    weightGrams: int('weightGrams', s.weightGrams),
    lengthMm: int('lengthMm', s.lengthMm),
    widthMm: int('widthMm', s.widthMm),
    heightMm: int('heightMm', s.heightMm),
    videoUrl: s.videoUrl.trim() || null,
    shippingInfo: s.shippingInfo,
    returnInfo: s.returnInfo,
    warrantyInfo: s.warrantyInfo,
    isReturnable: s.isReturnable,
    returnWindowDays: int('returnWindowDays', s.returnWindowDays, false) ?? 0,
    isCodAvailable: s.isCodAvailable,
    metaTitle: s.metaTitle,
    metaDescription: s.metaDescription,
    variants: s.variants.map((v, i) => {
      const options = parseOptions(v.options);
      if (!options) errors[`variants.${i}.options`] = 'Use "Name: value", separated by |';
      return {
        ...(v.id ? { id: v.id } : {}),
        sku: v.sku,
        name: v.name,
        options: options ?? {},
        mrp: money(`variants.${i}.mrp`, v.mrp),
        price: money(`variants.${i}.price`, v.price),
        weightGrams: int(`variants.${i}.weightGrams`, v.weightGrams),
        isDefault: v.isDefault,
        isActive: v.isActive,
        lowStockThreshold: int(`variants.${i}.lowStockThreshold`, v.lowStockThreshold, false) ?? 0,
        initialStock: v.id ? 0 : (int(`variants.${i}.initialStock`, v.initialStock, false) ?? 0),
      };
    }),
    images: s.images.map((img) => ({
      ...(img.id ? { id: img.id } : { mediaId: img.mediaId }),
      alt: img.alt,
      variantSku: img.variantSku || null,
    })),
  };
  return { payload, errors };
}
