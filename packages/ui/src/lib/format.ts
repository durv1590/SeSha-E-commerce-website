const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats an amount in paise as Indian Rupees with Indian digit grouping
 * (₹1,24,999). Whole-rupee amounts omit decimals; otherwise both paise digits
 * are shown (₹499.50, never ₹499.5).
 */
export function formatINR(paise: number): string {
  const value = Math.round(paise);
  return (value % 100 === 0 ? inrWhole : inrPaise).format(value / 100);
}

/** Whole-number discount percentage, rounded down so we never overstate a saving. */
export function discountPercent(mrp: number, price: number): number {
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.floor(((mrp - price) / mrp) * 100);
}

/** Compact counts for ratings/reviews: 950, 1.2K, 3.4L (lakh), 1.1Cr. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 100_000) return `${trim(n / 1000)}K`;
  if (n < 10_000_000) return `${trim(n / 100_000)}L`;
  return `${trim(n / 10_000_000)}Cr`;
}

function trim(v: number): string {
  return (Math.floor(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
}
