import { z } from 'zod';
import { idSchema } from './cart';
import { paiseSchema } from './primitives';

/** Staff operations: order queues, returns, customers and coupons. */

const pageFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .optional()
  .or(z.literal('').transform(() => undefined));

/** Work queues first, then individual statuses. */
export const ADMIN_ORDER_FILTERS = [
  'all',
  'to_ship',
  'returns',
  'refund_pending',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURN_REQUESTED',
  'RETURNED',
  'REFUND_INITIATED',
  'REFUNDED',
] as const;
export type AdminOrderFilter = (typeof ADMIN_ORDER_FILTERS)[number];

export const adminOrderListQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(ADMIN_ORDER_FILTERS).default('all'),
    payment: z.enum(['all', 'PREPAID', 'COD']).default('all'),
    from: isoDay,
    to: isoDay,
    ...pageFields,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['to'],
    message: 'The end date is before the start date',
  });
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

export const RETURN_FILTERS = [
  'open',
  'all',
  'REQUESTED',
  'APPROVED',
  'RECEIVED',
  'REJECTED',
  'COMPLETED',
] as const;
export const adminReturnListQuerySchema = z.object({
  status: z.enum(RETURN_FILTERS).default('open'),
  ...pageFields,
});
export type AdminReturnListQuery = z.infer<typeof adminReturnListQuerySchema>;

// ------------------------------------------------------------------ customers

export const customerListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'ACTIVE', 'SUSPENDED']).default('all'),
  sort: z.enum(['recent', 'spent', 'orders']).default('recent'),
  ...pageFields,
});
export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerStatusSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']),
    reason: z.string().trim().max(300).optional(),
  })
  .refine((s) => s.status === 'ACTIVE' || (s.reason?.length ?? 0) >= 3, {
    path: ['reason'],
    message: 'Say why the account is being suspended',
  });
export type CustomerStatusInput = z.infer<typeof customerStatusSchema>;

// -------------------------------------------------------------------- coupons

const optionalDate = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .or(z.literal('').transform(() => null))
  .transform((v) => (v ? new Date(v) : null));
const optionalPositiveInt = z
  .number()
  .int()
  .positive()
  .nullish()
  .transform((v) => v ?? null);

export const couponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, '3–32 letters, numbers, - or _'),
    description: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((v) => v || null),
    type: z.enum(['PERCENTAGE', 'FIXED']),
    /** PERCENTAGE: 1–100 (%). FIXED: paise. */
    value: z.number().int().positive('Enter a discount'),
    maxDiscount: paiseSchema
      .positive()
      .nullish()
      .transform((v) => v ?? null),
    minCartValue: paiseSchema.default(0),
    startsAt: optionalDate,
    endsAt: optionalDate,
    usageLimit: optionalPositiveInt,
    usagePerUser: z.number().int().min(1).max(100).default(1),
    firstOrderOnly: z.boolean().default(false),
    productIds: z.array(idSchema).max(200).default([]),
    categoryIds: z.array(idSchema).max(100).default([]),
    isActive: z.boolean().default(true),
  })
  .superRefine((c, ctx) => {
    if (c.type === 'PERCENTAGE' && c.value > 100)
      ctx.addIssue({ code: 'custom', path: ['value'], message: 'A percentage can’t exceed 100' });
    if (c.type === 'FIXED' && c.maxDiscount !== null)
      ctx.addIssue({
        code: 'custom',
        path: ['maxDiscount'],
        message: 'A maximum discount only applies to percentage coupons',
      });
    if (c.startsAt && c.endsAt && c.startsAt >= c.endsAt)
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must be after the start',
      });
    if (c.type === 'FIXED' && c.minCartValue > 0 && c.value > c.minCartValue)
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message: 'The discount is larger than the minimum order value',
      });
  });
export type CouponInput = z.infer<typeof couponInputSchema>;

export const COUPON_STATES = ['all', 'live', 'scheduled', 'expired', 'inactive'] as const;
export const couponListQuerySchema = z.object({
  q: z.string().trim().max(40).optional(),
  state: z.enum(COUPON_STATES).default('all'),
  ...pageFields,
});
export type CouponListQuery = z.infer<typeof couponListQuerySchema>;

// ------------------------------------------------------------- audit & staff

export const auditQuerySchema = z
  .object({
    action: z.string().trim().max(60).optional(),
    entityType: z.string().trim().max(40).optional(),
    entityId: z.string().trim().max(40).optional(),
    actorId: idSchema.optional(),
    from: isoDay,
    to: isoDay,
    ...pageFields,
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    path: ['to'],
    message: 'The end date is before the start date',
  });
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const STAFF_ROLES_EDITABLE = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'INVENTORY_MANAGER',
  'CUSTOMER_SUPPORT',
] as const;

export const staffInviteSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().max(254).email('Enter a valid email address'),
  role: z.enum(STAFF_ROLES_EDITABLE),
});
export type StaffInviteInput = z.infer<typeof staffInviteSchema>;

export const staffUpdateSchema = z.object({
  role: z.enum([...STAFF_ROLES_EDITABLE, 'CUSTOMER']),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

export const salesReportQuerySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    groupBy: z.enum(['day', 'month']).default('day'),
  })
  .refine((q) => q.from <= q.to, { path: ['to'], message: 'The end date is before the start date' })
  .refine((q) => (new Date(q.to).getTime() - new Date(q.from).getTime()) / 86_400_000 <= 731, {
    path: ['to'],
    message: 'Choose at most two years',
  });
export type SalesReportQuery = z.infer<typeof salesReportQuerySchema>;
