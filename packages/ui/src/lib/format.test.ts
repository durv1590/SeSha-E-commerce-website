import { discountPercent, formatCount, formatINR } from './format';

describe('formatINR', () => {
  it('uses Indian digit grouping and hides .00', () => {
    expect(formatINR(12499900)).toBe('₹1,24,999');
    expect(formatINR(49900)).toBe('₹499');
  });
  it('keeps paise when present', () => {
    expect(formatINR(49950)).toBe('₹499.50');
  });
});

describe('discountPercent', () => {
  it('rounds down so savings are never overstated', () => {
    expect(discountPercent(99900, 66900)).toBe(33); // 33.03%
    expect(discountPercent(1000, 334)).toBe(66); // 66.6%
  });
  it('returns 0 for no discount or bad input', () => {
    expect(discountPercent(1000, 1000)).toBe(0);
    expect(discountPercent(1000, 1200)).toBe(0);
    expect(discountPercent(0, 0)).toBe(0);
  });
});

describe('formatCount', () => {
  it('uses Indian compact units', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(1250)).toBe('1.2K');
    expect(formatCount(340000)).toBe('3.4L');
    expect(formatCount(11000000)).toBe('1.1Cr');
  });
});
