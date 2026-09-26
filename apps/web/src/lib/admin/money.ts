/** Rupee text typed by staff ("1,299.50", "₹ 999") → paise; null when not a valid amount. */
export function rupeesToPaise(input: string): number | null {
  const clean = input.replace(/[,₹\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Paise → the plain rupee text shown in an input ("1299.5" → "1299.50", whole → "1299"). */
export function paiseToRupees(paise: number): string {
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}
