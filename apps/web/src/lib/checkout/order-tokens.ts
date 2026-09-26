/**
 * Guest order tokens (from placing an order) let this browser show the order's
 * confirmation and retry its payment. Kept in localStorage, newest 10 only; signed-in
 * customers never need them.
 */
const KEY = 'sk_order_tokens';
const MAX = 10;

function read(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveOrderToken(orderNumber: string, token: string): void {
  try {
    const next = Object.entries({ ...read(), [orderNumber]: token }).slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(next)));
  } catch {
    // storage unavailable: the order email still links to the account/support
  }
}

export function orderTokenHeaders(orderNumber: string): Record<string, string> {
  const token = read()[orderNumber];
  return token ? { 'x-order-token': token } : {};
}
