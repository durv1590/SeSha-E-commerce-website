import { describe, expect, it } from 'vitest';
import { paiseToRupees, rupeesToPaise } from './money';

describe('admin money inputs', () => {
  it('parses rupee text', () => {
    expect(rupeesToPaise('1,299.50')).toBe(129_950);
    expect(rupeesToPaise('₹ 999')).toBe(99_900);
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(rupeesToPaise('12.345')).toBeNull();
    expect(rupeesToPaise('-5')).toBeNull();
    expect(rupeesToPaise('')).toBeNull();
  });
  it('formats paise for inputs', () => {
    expect(paiseToRupees(129_950)).toBe('1299.50');
    expect(paiseToRupees(99_900)).toBe('999');
  });
});
