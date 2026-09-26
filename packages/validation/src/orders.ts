import { z } from 'zod';
import { idSchema } from './cart';
import { orderNumberSchema } from './checkout';
import { emailSchema, indianMobileSchema, pincodeSchema } from './primitives';

export const ORDER_LIST_FILTERS = ['all', 'active', 'delivered', 'cancelled', 'returns'] as const;

export const orderListQuerySchema = z.object({
  filter: z.enum(ORDER_LIST_FILTERS).default('all'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(10),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

const optionalComments = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => v || undefined);

export const CANCEL_REASONS = {
  CHANGED_MIND: 'I changed my mind',
  BETTER_PRICE: 'I found a better price elsewhere',
  ORDERED_BY_MISTAKE: 'I ordered by mistake',
  DELIVERY_TOO_SLOW: 'Delivery would take too long',
  CHANGE_ADDRESS_OR_PAYMENT: 'I need to change the address or payment method',
  OTHER: 'Other',
} as const;

export const cancelOrderSchema = z.object({
  reason: z.enum(
    Object.keys(CANCEL_REASONS) as [
      keyof typeof CANCEL_REASONS,
      ...(keyof typeof CANCEL_REASONS)[],
    ],
  ),
  comments: optionalComments,
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const RETURN_REASONS = {
  DAMAGED: 'Item arrived damaged',
  DEFECTIVE: 'Item is defective or doesn’t work',
  WRONG_ITEM: 'I received the wrong item',
  NOT_AS_DESCRIBED: 'Item isn’t as described',
  SIZE_FIT: 'Size or fit isn’t right',
  MISSING_PARTS: 'Parts or accessories are missing',
  OTHER: 'Other',
} as const;

export const returnRequestSchema = z.object({
  type: z.enum(['RETURN', 'REPLACEMENT']),
  reason: z.enum(
    Object.keys(RETURN_REASONS) as [
      keyof typeof RETURN_REASONS,
      ...(keyof typeof RETURN_REASONS)[],
    ],
  ),
  comments: optionalComments,
  items: z
    .array(z.object({ orderItemId: idSchema, quantity: z.number().int().min(1).max(99) }))
    .min(1, 'Choose at least one item')
    .max(50)
    .refine(
      (items) => new Set(items.map((i) => i.orderItemId)).size === items.length,
      'Each item only once',
    ),
});
export type ReturnRequestInput = z.infer<typeof returnRequestSchema>;

/** Public order tracking: order number plus the email or mobile used for it. */
export const trackOrderSchema = z.object({
  orderNumber: orderNumberSchema,
  contact: z.union([emailSchema, indianMobileSchema], {
    errorMap: () => ({ message: 'Enter the email or mobile number used for the order' }),
  }),
});
export type TrackOrderInput = z.infer<typeof trackOrderSchema>;

export const serviceabilityQuerySchema = z.object({ pincode: pincodeSchema });

// ---------------------------------------------------------------- staff

export const CARRIERS = [
  'delhivery',
  'bluedart',
  'dtdc',
  'indiapost',
  'shiprocket',
  'ecomexpress',
  'xpressbees',
  'other',
] as const;
export type Carrier = (typeof CARRIERS)[number];

export const staffOrderStatusSchema = z.object({
  status: z.enum(['PROCESSING', 'PACKED']),
  note: z.string().trim().max(300).optional(),
});

export const createShipmentSchema = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z
    .string()
    .trim()
    .min(4)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, digits and hyphens only'),
  trackingUrl: z.string().url().max(300).startsWith('https://', 'Use an https:// link').optional(),
  estimatedDelivery: z.coerce.date().optional(),
});
export type CreateShipmentInput = z.infer<typeof createShipmentSchema>;

export const SHIPMENT_EVENT_STATUSES = [
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'FAILED',
  'RETURNED',
] as const;
export const shipmentEventSchema = z.object({
  status: z.enum(SHIPMENT_EVENT_STATUSES),
  location: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
  at: z.coerce.date().optional(),
});
export type ShipmentEventInput = z.infer<typeof shipmentEventSchema>;

export const staffCancelSchema = z.object({ reason: z.string().trim().min(3).max(300) });

export const returnActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'receive', 'complete']),
  note: z.string().trim().max(500).optional(),
  /** On receive: put the returned units back into sellable stock. */
  restock: z.boolean().default(true),
});
export type ReturnActionInput = z.infer<typeof returnActionSchema>;

export const refundRequestSchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(300),
});

export const manualRefundSchema = z.object({
  reference: z.string().trim().min(4).max(60),
});

export const returnIdSchema = idSchema;
