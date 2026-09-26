import type { Request } from 'express';
import { hmac } from '../auth/crypto';

/** Guests prove they placed an order with this header (the token from placement). */
export const ORDER_TOKEN_HEADER = 'x-order-token';

export interface OrderAccess {
  userId: string | null;
  guestToken: string | null;
}

export function orderAccess(req: Request): OrderAccess {
  const token = req.header(ORDER_TOKEN_HEADER);
  return {
    userId: req.auth?.userId ?? null,
    guestToken: token && /^[A-Za-z0-9_-]{20,100}$/.test(token) ? token : null,
  };
}

/**
 * A guest's order token is derived from the client-generated idempotency key and the
 * guest's own cart credential, so a retried "place order" from the same browser gets
 * the same token, while anyone else replaying the key gets a conflict. Only the
 * token's hash is stored.
 */
export function guestTokenFor(
  secret: string,
  idempotencyKey: string,
  cartToken: string | null,
): string {
  return Buffer.from(
    hmac(secret, `order-access:${idempotencyKey}:${cartToken ?? ''}`),
    'hex',
  ).toString('base64url');
}

export function hashGuestToken(secret: string, token: string): string {
  return hmac(secret, `order-token:${token}`);
}
