import type { VariantDto } from '@seshakart/types';
import { describe, expect, it } from 'vitest';
import {
  availableValues,
  findVariant,
  optionValues,
  orderOptionNames,
  selectValue,
} from './variant-selection';

const v = (id: string, Colour: string, Size: string, available: number): VariantDto => ({
  id,
  sku: id,
  name: `${Colour} / ${Size}`,
  options: { Colour, Size },
  mrp: 100,
  price: 90,
  available,
  stock: available > 0 ? 'in_stock' : 'out_of_stock',
  isDefault: false,
  imageIds: [],
});
const variants = [v('nm', 'Navy', 'M', 5), v('nl', 'Navy', 'L', 0), v('wm', 'White', 'M', 3)];

describe('variant selection', () => {
  it('lists option values in order', () => {
    expect(optionValues(variants, ['Colour', 'Size'])).toEqual({
      Colour: ['Navy', 'White'],
      Size: ['M', 'L'],
    });
  });
  it('finds exact matches', () => {
    expect(findVariant(variants, { Colour: 'Navy', Size: 'L' })?.id).toBe('nl');
  });
  it('knows which values combine with the current selection', () => {
    expect([...availableValues(variants, 'Size', { Colour: 'White', Size: 'M' })]).toEqual(['M']);
  });
  it('switches to the closest in-stock variant when a combination does not exist', () => {
    expect(selectValue(variants, { Colour: 'Navy', Size: 'L' }, 'Colour', 'White')?.id).toBe('wm');
  });
});

describe('option ordering', () => {
  it('shows colour first, then size, then others alphabetically', () => {
    expect(orderOptionNames(['Size', 'Material', 'Colour', 'Fit'])).toEqual([
      'Colour',
      'Size',
      'Fit',
      'Material',
    ]);
  });
});
