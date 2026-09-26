import { z } from 'zod';
import { emailSchema, indianMobileSchema, pincodeSchema } from './primitives';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish();

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name').max(80),
    email: emailSchema.nullish().or(z.literal('').transform(() => null)),
    phone: indianMobileSchema.nullish().or(z.literal('').transform(() => null)),
    marketingOptIn: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const ADDRESS_LIMIT = 20;

export const addressSchema = z.object({
  label: z.enum(['HOME', 'WORK', 'OTHER']).default('HOME'),
  name: z.string().trim().min(2, 'Enter the recipient’s name').max(80),
  phone: indianMobileSchema,
  line1: z.string().trim().min(3, 'Enter house number and street').max(160),
  line2: optionalText(160),
  landmark: optionalText(120),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.string().trim().min(2, 'Select the state').max(80),
  pincode: pincodeSchema,
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const addressUpdateSchema = addressSchema.partial();
