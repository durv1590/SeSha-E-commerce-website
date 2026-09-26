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
  /**
   * State of the GST registration. Decides the invoice tax split: CGST + SGST for
   * deliveries within this state, IGST otherwise (treated as inter-state until set).
   */
  registeredState: z.string().trim().max(80).default(''),
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

export const searchSettingsSchema = z.object({
  /**
   * Admin-curated trending searches, shown until enough real search data exists
   * (and alongside it). Never auto-generated: empty by default.
   */
  trending: z.array(z.string().trim().min(2).max(40)).max(10).default([]),
  /** A query must be searched this many times before it can appear as "popular". */
  popularMinCount: z.number().int().min(1).max(1000).default(5),
});
export type SearchSettings = z.infer<typeof searchSettingsSchema>;

const pinPrefix = z.string().regex(/^\d{1,6}$/, 'Use 1–6 digits');
const dayRange = z
  .object({ min: z.number().int().min(0).max(30), max: z.number().int().min(0).max(30) })
  .refine((r) => r.min <= r.max, { message: 'min must not exceed max' });

export const shippingSettingsSchema = z.object({
  /** Business days (Mon–Sat) from order to delivery. */
  standardDays: dayRange.default({ min: 3, max: 6 }),
  expressDays: dayRange.default({ min: 1, max: 3 }),
  /** PIN code prefixes that take longer: islands, the north-east, Jammu & Kashmir and Ladakh. */
  remotePrefixes: z.array(pinPrefix).max(300).default(['744', '79', '18', '19']),
  remoteExtraDays: z.number().int().min(0).max(15).default(2),
  /** Express isn't offered to remote PIN codes. */
  expressToRemote: z.boolean().default(false),
  /** PIN code prefixes we can't deliver to at all. */
  blockedPrefixes: z.array(pinPrefix).max(300).default([]),
  /** PIN code prefixes where cash on delivery isn't offered. */
  codBlockedPrefixes: z.array(pinPrefix).max(300).default(['744']),
});
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;

export const SETTINGS_SCHEMAS = {
  store: storeSettingsSchema,
  commerce: commerceSettingsSchema,
  search: searchSettingsSchema,
  shipping: shippingSettingsSchema,
} as const;
export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type SettingsValue<K extends SettingsKey> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;
