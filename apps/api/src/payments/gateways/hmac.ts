import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function hmacHex(secret: string, data: string | Buffer): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/** Constant-time comparison of hex signatures. */
export function signatureMatches(expected: string, given: string | undefined): boolean {
  if (!given) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given.trim(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
