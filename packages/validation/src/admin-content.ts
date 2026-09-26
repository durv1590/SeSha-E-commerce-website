import { z } from 'zod';
import { assetUrlSchema } from './admin-catalog';
import { idSchema } from './cart';
import { slugSchema } from './primitives';

/** Staff-managed storefront content: banners, homepage rails, CMS pages and SEO. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalDate = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .or(z.literal('').transform(() => null))
  .transform((v) => (v ? new Date(v) : null));

/** A link target: a path on this site ("/deals") or an https:// URL. */
export const linkSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => /^\/(?!\/)[^\s"'<>]*$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v),
    'Use a path like /deals or an https:// link',
  )
  .nullish()
  .or(z.literal('').transform(() => null))
  .transform((v) => v ?? null);

export const BANNER_PLACEMENTS = ['HOME_HERO', 'HOME_PROMO', 'CATEGORY_TOP'] as const;
export const BANNER_THEMES = ['PRIMARY', 'NAVY', 'ACCENT', 'LIGHT'] as const;

export const bannerInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Enter a title').max(80),
    subtitle: optionalText(160),
    ctaLabel: optionalText(30),
    link: linkSchema,
    placement: z.enum(BANNER_PLACEMENTS),
    theme: z.enum(BANNER_THEMES).default('PRIMARY'),
    imageDesktop: assetUrlSchema,
    imageTablet: assetUrlSchema,
    imageMobile: assetUrlSchema,
    imageAlt: optionalText(160),
    startsAt: optionalDate,
    endsAt: optionalDate,
    priority: z.number().int().min(0).max(1000).default(0),
    isActive: z.boolean().default(true),
  })
  .superRefine((b, ctx) => {
    if (b.startsAt && b.endsAt && b.startsAt >= b.endsAt)
      ctx.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: 'The end must be after the start',
      });
    if (b.ctaLabel && !b.link)
      ctx.addIssue({ code: 'custom', path: ['link'], message: 'A button needs a link' });
    const hasImage = b.imageDesktop || b.imageTablet || b.imageMobile;
    if (hasImage && !b.imageAlt)
      ctx.addIssue({
        code: 'custom',
        path: ['imageAlt'],
        message: 'Describe the image for customers using screen readers',
      });
  });
export type BannerInput = z.infer<typeof bannerInputSchema>;

export const HOME_SECTION_SOURCES = [
  'BEST_SELLERS',
  'NEW_ARRIVALS',
  'FEATURED',
  'DEALS',
  'CATEGORY',
] as const;

export const homeSectionInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Enter a title').max(60),
    subtitle: optionalText(120),
    source: z.enum(HOME_SECTION_SOURCES),
    categoryId: idSchema.nullish().transform((v) => v ?? null),
    limit: z.number().int().min(4).max(24).default(12),
    isActive: z.boolean().default(true),
  })
  .refine((s) => s.source !== 'CATEGORY' || Boolean(s.categoryId), {
    path: ['categoryId'],
    message: 'Choose a category',
  })
  .transform((s) => ({ ...s, categoryId: s.source === 'CATEGORY' ? s.categoryId : null }));
export type HomeSectionInput = z.infer<typeof homeSectionInputSchema>;

export const reorderSchema = z.object({
  ids: z.array(idSchema).min(1).max(100),
});

/** Paths the storefront already uses; CMS pages live under /pages/<slug>. */
export const pageInputSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title').max(120),
  slug: slugSchema.optional().or(z.literal('').transform(() => undefined)),
  content: z.string().max(50_000).default(''),
  metaTitle: optionalText(70),
  metaDescription: optionalText(160),
  isPublished: z.boolean().default(false),
});
export type PageInput = z.infer<typeof pageInputSchema>;

/** A storefront path for an SEO override: "/", "/deals", "/category/phones"… */
export const seoPathSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/, 'Use a path like / or /category/phones')
  .refine((p) => !/^\/(admin|api|account|checkout|cart|internal)(\/|$)/.test(p), {
    message: 'This part of the site isn’t indexed',
  });

export const seoOverrideInputSchema = z.object({
  path: seoPathSchema,
  title: optionalText(70),
  description: optionalText(160),
  ogImage: assetUrlSchema,
  noindex: z.boolean().default(false),
});
export type SeoOverrideInput = z.infer<typeof seoOverrideInputSchema>;

export const settingsKeySchema = z.enum(['store', 'commerce', 'shipping', 'search']);
