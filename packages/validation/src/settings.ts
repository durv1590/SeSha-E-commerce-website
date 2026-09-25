import { z } from 'zod';
import { emailSchema, indianMobileSchema, paiseSchema } from './primitives';

/**
 * Admin-editable settings, stored as JSON rows in the `settings` table and
 * validated with these schemas on every read and write. Defaults apply for any
 * missing field, so new settings can ship without a data migration.
 */
export const storeSettingsSchema = z.object({
  name: z.string().min(1).max(80).default('SeShaKart'),
  legalName: z.string().min(1).max(120).default('SeShaKart Pvt. Ltd.'),
  tagline: z.string().max(120).default('Smart Shopping, Better Living'),
  supportEmail: emailSchema.default('durvesh15aug@gmail.com'),
  supportPhone: indianMobileSchema.default('8218397819'),
  /** GSTIN printed on invoices; empty until registered. */
  gstin: z
    .string()
    .trim()
    .regex(
      /^$|^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
      'Enter a valid 15-character GSTIN',
    )
    .default(''),
  registeredAddress: z.string().max(300).default(''),
});
export type StoreSettings = z.infer<typeof storeSettingsSchema>;

export const commerceSettingsSchema = z
  .object({
    /** Orders at or above this subtotal (paise) ship free. */
    freeShippingThreshold: paiseSchema.default(49_900),
    standardShippingFee: paiseSchema.default(4_900),
    expressShippingFee: paiseSchema.default(9_900),
    expressEnabled: z.boolean().default(true),
    codEnabled: z.boolean().default(true),
    codFee: paiseSchema.default(4_900),
    /** COD is not offered above this order value (paise). */
    codMaxOrderValue: paiseSchema.default(1_000_000),
    maxQuantityPerItem: z.number().int().min(1).max(99).default(10),
    /** How long stock stays reserved while an online payment is pending. */
    stockReservationMinutes: z.number().int().min(5).max(120).default(30),
    /** Carts untouched for this long are purged. */
    cartRetentionDays: z.number().int().min(1).max(365).default(60),
  })
  .refine((s) => s.codMaxOrderValue > 0, {
    path: ['codMaxOrderValue'],
    message: 'Must be positive',
  });
export type CommerceSettings = z.infer<typeof commerceSettingsSchema>;

export const SETTINGS_SCHEMAS = {
  store: storeSettingsSchema,
  commerce: commerceSettingsSchema,
} as const;
export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;
