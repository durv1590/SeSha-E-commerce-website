import { z } from 'zod';
import { addressSchema } from './account';
import { idSchema } from './cart';
import { emailSchema, indianMobileSchema, paiseSchema, pincodeSchema } from './primitives';

export const DELIVERY_METHOD_VALUES = ['STANDARD', 'EXPRESS'] as const;
export const PAYMENT_METHOD_VALUES = ['PREPAID', 'COD'] as const;

/** An address typed in at checkout (the address-book fields, without label/default). */
export const checkoutAddressSchema = addressSchema.omit({ label: true, isDefault: true });
export type CheckoutAddressInput = z.infer<typeof checkoutAddressSchema>;

export const checkoutQuoteSchema = z.object({
  deliveryMethod: z.enum(DELIVERY_METHOD_VALUES).default('STANDARD'),
  paymentMethod: z.enum(PAYMENT_METHOD_VALUES).default('PREPAID'),
  /** Delivery PIN code, when known: decides express and cash-on-delivery availability. */
  pincode: pincodeSchema.optional(),
});
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;

/** Random per-attempt key from the browser; the same key never creates two orders. */
export const idempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, 'Invalid request key');

export const placeOrderSchema = z
  .object({
    /** Required for guests; signed-in customers default to their account details. */
    contact: z.object({ email: emailSchema, phone: indianMobileSchema }).optional(),
    shippingAddressId: idSchema.optional(),
    shippingAddress: checkoutAddressSchema.optional(),
    /** Signed-in customers can add a typed address to their address book. */
    saveAddress: z.boolean().default(false),
    billingSameAsShipping: z.boolean().default(true),
    billingAddress: checkoutAddressSchema.optional(),
    deliveryMethod: z.enum(DELIVERY_METHOD_VALUES).default('STANDARD'),
    paymentMethod: z.enum(PAYMENT_METHOD_VALUES),
    /** The total the shopper saw; a mismatch means prices changed and must be re-confirmed. */
    expectedTotal: paiseSchema,
    idempotencyKey: idempotencyKeySchema,
    notes: z
      .string()
      .trim()
      .max(300)
      .optional()
      .transform((v) => v || undefined),
  })
  .refine((v) => Boolean(v.shippingAddressId) !== Boolean(v.shippingAddress), {
    path: ['shippingAddress'],
    message: 'Choose a saved address or enter a new one',
  })
  .refine((v) => v.billingSameAsShipping || Boolean(v.billingAddress), {
    path: ['billingAddress'],
    message: 'Enter the billing address',
  });
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^SK\d{10,16}$/, 'Invalid order number');

const providerRef = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.:-]+$/);

/** Sent by the browser after the gateway's checkout succeeds; verified by signature. */
export const verifyPaymentSchema = z.object({
  orderNumber: orderNumberSchema,
  providerOrderId: providerRef,
  providerPaymentId: providerRef,
  signature: z.string().trim().min(1).max(256),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

/** Reported by the browser when the gateway checkout fails or is dismissed. */
export const paymentFailedSchema = z.object({
  orderNumber: orderNumberSchema,
  providerOrderId: providerRef.optional(),
  code: z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).optional(),
});
export type PaymentFailedInput = z.infer<typeof paymentFailedSchema>;

export const orderRefSchema = z.object({ orderNumber: orderNumberSchema });

/** Development-only simulated payment outcome (mock gateway). */
export const mockPaymentSchema = z.object({
  orderNumber: orderNumberSchema,
  outcome: z.enum(['success', 'failure']),
});
export type MockPaymentInput = z.infer<typeof mockPaymentSchema>;
