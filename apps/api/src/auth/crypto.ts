import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/** Keyed hash for secrets stored at rest (refresh tokens, OTPs, guest tokens). */
export function hmac(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** URL-safe random token with `bytes` of entropy (default 256 bits). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Uniformly random 6-digit code (crypto RNG, leading zeros allowed). */
export function randomOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
