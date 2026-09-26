import { describe, expect, it } from 'vitest';
import {
  assetUrlSchema,
  categoryInputSchema,
  productInputSchema,
  slugify,
  stockAdjustmentSchema,
} from './admin-catalog';

const variant = { sku: 'tee-blk-m', name: 'Black / M', mrp: 99900, price: 79900 };
const base = {
  name: 'Cotton Tee',
  sku: 'tee-001',
  categoryId: 'cat1',
  taxRate: 5,
  variants: [variant],
};

describe('productInputSchema', () => {
  it('normalises SKUs and applies defaults', () => {
    const p = productInputSchema.parse(base);
    expect(p.sku).toBe('TEE-001');
    expect(p.variants[0]!.sku).toBe('TEE-BLK-M');
    expect(p.variants[0]!.isActive).toBe(true);
    expect(p.hsnCode).toBeNull();
    expect(p.images).toEqual([]);
  });

  it('rejects MRP below price, duplicate SKUs, two defaults and bad GST', () => {
    const r = productInputSchema.safeParse({
      ...base,
      taxRate: 7,
      variants: [
        { ...variant, mrp: 100, price: 200, isDefault: true },
        { ...variant, sku: 'TEE-BLK-M', isDefault: true },
      ],
    });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(
      expect.arrayContaining(['taxRate', 'variants.0.mrp', 'variants.1.sku', 'variants']),
    );
  });

  it('requires all three dimensions or none, and images with one source', () => {
    expect(productInputSchema.safeParse({ ...base, lengthMm: 10 }).success).toBe(false);
    expect(
      productInputSchema.safeParse({ ...base, lengthMm: 10, widthMm: 5, heightMm: 2 }).success,
    ).toBe(true);
    expect(productInputSchema.safeParse({ ...base, images: [{ alt: 'Front' }] }).success).toBe(
      false,
    );
    expect(
      productInputSchema.safeParse({ ...base, images: [{ mediaId: 'm1', alt: 'Front' }] }).success,
    ).toBe(true);
  });

  it('links images only to variants in the list', () => {
    const r = productInputSchema.safeParse({
      ...base,
      images: [{ mediaId: 'm1', alt: 'Red', variantSku: 'TEE-RED-M' }],
    });
    expect(r.success).toBe(false);
  });
});

describe('assetUrlSchema', () => {
  it('accepts uploads and https, rejects scripts and other schemes', () => {
    expect(assetUrlSchema.parse('/api/media/uploads/2026/09/ab12.webp')).toBe(
      '/api/media/uploads/2026/09/ab12.webp',
    );
    expect(assetUrlSchema.parse('https://cdn.example.com/a.png')).toBe(
      'https://cdn.example.com/a.png',
    );
    expect(assetUrlSchema.parse('')).toBeNull();
    for (const bad of ['javascript:alert(1)', 'http://x.com/a.png', '/etc/passwd', '//evil.com/a'])
      expect(assetUrlSchema.safeParse(bad).success).toBe(false);
    expect(
      categoryInputSchema.safeParse({ name: 'Audio', imageUrl: 'data:image/png;base64,x' }).success,
    ).toBe(false);
  });
});

describe('slugify and stock adjustments', () => {
  it('slugifies names', () => {
    expect(slugify("Men's T-Shirt (Blue) & Co.")).toBe('mens-t-shirt-blue-and-co');
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('requires a positive quantity except for set', () => {
    expect(
      stockAdjustmentSchema.safeParse({ mode: 'add', quantity: 0, reason: 'Count' }).success,
    ).toBe(false);
    expect(
      stockAdjustmentSchema.safeParse({ mode: 'set', quantity: 0, reason: 'Count' }).success,
    ).toBe(true);
    expect(
      stockAdjustmentSchema.safeParse({ mode: 'remove', quantity: 2, reason: 'x' }).success,
    ).toBe(false);
  });
});
