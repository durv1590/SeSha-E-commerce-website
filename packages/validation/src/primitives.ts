import { z } from 'zod';

/** Indian mobile number: 10 digits starting 6–9. Accepts optional +91 / 0 prefix and spaces. */
export const indianMobileSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'));

/** Indian PIN code: 6 digits, first digit 1–9. */
export const pincodeSchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email address');

/** At least 8 chars with a letter and a number; capped to bound hashing cost. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

/** URL slug: lowercase letters, digits and single hyphens. */
export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

/** Money is stored and transported as integer paise. */
export const paiseSchema = z.number().int().nonnegative().max(1_000_000_000);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationInput = z.infer<typeof paginationSchema>;
