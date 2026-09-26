import { z } from 'zod';
import { idSchema } from './cart';

/** Product reviews: written by customers who received the product, moderated by staff. */

export const reviewInputSchema = z.object({
  productId: idSchema,
  rating: z.number().int().min(1, 'Choose a rating').max(5),
  title: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => v || null),
  body: z
    .string()
    .trim()
    .min(10, 'Write at least 10 characters')
    .max(3000, 'Keep it under 3,000 characters'),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const productReviewsQuerySchema = z.object({
  sort: z.enum(['recent', 'highest', 'lowest']).default('recent'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export type ProductReviewsQuery = z.infer<typeof productReviewsQuerySchema>;

export const adminReviewListQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'all']).default('PENDING'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminReviewListQuery = z.infer<typeof adminReviewListQuerySchema>;

export const reviewModerationSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    note: z.string().trim().max(300).optional(),
  })
  .refine((m) => m.action === 'approve' || (m.note?.length ?? 0) >= 3, {
    path: ['note'],
    message: 'Say why the review is rejected (the customer sees this)',
  });
export type ReviewModerationInput = z.infer<typeof reviewModerationSchema>;
