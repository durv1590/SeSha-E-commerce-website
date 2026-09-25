import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id (OWASP recommended parameters: 19 MiB memory,
 * 2 iterations, 1 degree of parallelism).
 */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}
