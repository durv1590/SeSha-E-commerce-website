/**
 * Pure invoice arithmetic (GST split, numbering, amount in words), unit-tested and
 * kept apart from PDF layout.
 */

/** Indian financial year (April–March) of a date, in India time: "26-27". */
export function financialYear(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear() % 100;
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  const pad = (n: number) => String((n + 100) % 100).padStart(2, '0');
  return `${pad(start)}-${pad(start + 1)}`;
}

/** GST-compliant invoice number (≤ 16 characters): SK/26-27/000123. */
export function formatInvoiceNumber(seq: bigint | number, date: Date): string {
  return `SK/${financialYear(date)}/${String(seq).padStart(6, '0')}`;
}

export interface InvoiceLineInput {
  /** Price × quantity, GST-inclusive, before the coupon. */
  lineTotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate: number;
}

export interface InvoiceLine {
  /** What the customer pays for the line (GST-inclusive, after the coupon). */
  gross: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

/**
 * Splits a line's GST: CGST + SGST (half each) when seller and delivery are in the same
 * state, IGST otherwise. When the seller's state isn't configured, IGST is used.
 */
export function splitTax(line: InvoiceLineInput, intraState: boolean): InvoiceLine {
  const gross = line.lineTotal - line.discountAmount;
  const tax = line.taxAmount;
  const cgst = intraState ? Math.floor(tax / 2) : 0;
  return {
    gross,
    taxable: gross - tax,
    cgst,
    sgst: intraState ? tax - cgst : 0,
    igst: intraState ? 0 : tax,
  };
}

export function isIntraState(sellerState: string, deliveryState: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(sellerState.trim()) && norm(sellerState) === norm(deliveryState);
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? belowHundred(r) : ''].filter(Boolean).join(' ');
}

/** Whole number in the Indian system (thousand, lakh, crore). */
export function numberInWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  const lakh = Math.floor((n % 10_000_000) / 100_000);
  const thousand = Math.floor((n % 100_000) / 1_000);
  const rest = n % 1_000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' ');
}

/** "Rupees One Thousand Five Hundred Forty Eight and Fifty Paise Only". */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${numberInWords(rupees)}${p ? ` and ${belowHundred(p)} Paise` : ''} Only`;
}
