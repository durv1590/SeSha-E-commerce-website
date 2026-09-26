import { productInputSchema } from '@seshakart/validation';
import { describe, expect, it } from 'vitest';
import { emptyState, formatOptions, parseOptions, toPayload } from './editor-state';

describe('product editor state', () => {
  it('parses and formats variant options', () => {
    expect(parseOptions('Colour: Black | Size: M')).toEqual({ Colour: 'Black', Size: 'M' });
    expect(parseOptions('')).toEqual({});
    expect(parseOptions('Time: 10:30')).toEqual({ Time: '10:30' });
    expect(parseOptions('Black')).toBeNull();
    expect(formatOptions({ Colour: 'Black', Size: 'M' })).toBe('Colour: Black | Size: M');
  });

  it('builds a payload the shared schema accepts', () => {
    const s = emptyState('cat1');
    Object.assign(s, {
      name: 'Cotton Tee',
      sku: 'tee-1',
      highlights: '100% cotton\n\nMachine wash ',
      tags: 'Summer, tee, ',
      lengthMm: '300',
      widthMm: '200',
      heightMm: '20',
    });
    Object.assign(s.variants[0]!, {
      sku: 'tee-1-m',
      name: 'M',
      options: 'Size: M',
      mrp: '999',
      price: '799.50',
      initialStock: '12',
    });
    const { payload, errors } = toPayload(s);
    expect(errors).toEqual({});
    const parsed = productInputSchema.parse(payload);
    expect(parsed.highlights).toEqual(['100% cotton', 'Machine wash']);
    expect(parsed.tags).toEqual(['summer', 'tee']);
    expect(parsed.variants[0]).toMatchObject({ mrp: 99_900, price: 79_950, initialStock: 12 });
    expect(parsed.slug).toBeUndefined();
  });

  it('reports inputs that are not numbers or amounts against their field', () => {
    const s = emptyState('cat1');
    Object.assign(s.variants[0]!, { mrp: 'abc', price: '', options: 'Black', initialStock: '2.5' });
    s.weightGrams = '1kg';
    const { errors } = toPayload(s);
    expect(Object.keys(errors).sort()).toEqual([
      'variants.0.initialStock',
      'variants.0.mrp',
      'variants.0.options',
      'variants.0.price',
      'weightGrams',
    ]);
  });
});
