/**
 * DEMO catalogue seed — development, QA and staging ONLY.
 *
 *   pnpm db:seed:demo            # (re)create the demo catalogue
 *   pnpm db:seed:demo --remove   # delete every demo record and image
 *
 * Refuses to run when NODE_ENV=production unless ALLOW_DEMO_SEED=true (staging
 * that runs production builds). Re-running replaces the previous demo data.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, type Prisma } from '@prisma/client';
import Redis from 'ioredis';
import * as icons from 'lucide-static';
import { loadEnv } from '../config/env';
import { StorageService } from '../storage/storage.service';
import {
  DEMO_BANNERS,
  DEMO_BRANDS,
  DEMO_CATEGORIES,
  DEMO_HOME_SECTIONS,
  DEMO_PRODUCTS,
  type DemoCategory,
} from './demo/catalog';
import { categoryImage, PALETTES, productImage, type Palette } from './demo/images';

const rootEnv = join(__dirname, '..', '..', '..', '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const env = loadEnv();
const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
const storage = new StorageService(env);
const DEMO_TAG = 'demo';
const MEDIA_PREFIX = 'demo';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function icon(name: string): string {
  const svg = (icons as unknown as Record<string, string>)[name];
  if (!svg) throw new Error(`Unknown demo icon: ${name}`);
  return svg;
}

const allCategorySlugs = (nodes: DemoCategory[]): string[] =>
  nodes.flatMap((n) => [n.slug, ...allCategorySlugs(n.children ?? [])]);

async function clearCatalogCache(): Promise<void> {
  if (!env.REDIS_URL) return;
  const redis = new Redis(env.REDIS_URL, { keyPrefix: '' });
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'sk:cache:catalog:*', 'COUNT', 500);
    cursor = next;
    if (keys.length) await redis.del(...keys);
  } while (cursor !== '0');
  await redis.quit();
}

async function remove(): Promise<void> {
  const products = await prisma.product.findMany({
    where: { tags: { has: DEMO_TAG } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.homeSection.deleteMany({
      where: { title: { in: DEMO_HOME_SECTIONS.map((s) => s.title) } },
    }),
    prisma.banner.deleteMany({ where: { title: { in: DEMO_BANNERS.map((b) => b.title) } } }),
    prisma.product.deleteMany({ where: { id: { in: products.map((p) => p.id) } } }),
    prisma.brand.deleteMany({ where: { slug: { in: DEMO_BRANDS.map((b) => b.slug) } } }),
    prisma.mediaAsset.deleteMany({ where: { storageKey: { startsWith: `${MEDIA_PREFIX}/` } } }),
  ]);
  // Delete categories leaf-first (parents are protected by ON DELETE RESTRICT).
  const slugs = allCategorySlugs(DEMO_CATEGORIES).reverse();
  for (const slug of slugs)
    await prisma.category.deleteMany({ where: { slug, children: { none: {} } } });
  await storage.deletePrefix(MEDIA_PREFIX);
  console.log(`Removed demo catalogue (${products.length} products).`);
}

async function saveImage(
  key: string,
  body: Buffer,
  width: number,
  height: number,
): Promise<string> {
  const url = await storage.put(key, body);
  await prisma.mediaAsset.create({
    data: { storageKey: key, url, mimeType: 'image/webp', sizeBytes: body.length, width, height },
  });
  return url;
}

async function createCategories(
  nodes: DemoCategory[],
  parentId: string | null,
  depth: number,
  palette?: Palette,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [i, node] of nodes.entries()) {
    const pal = palette ?? PALETTES[node.slug]!;
    const imageUrl = await saveImage(
      `${MEDIA_PREFIX}/categories/${node.slug}.webp`,
      await categoryImage(icon(node.icon), pal),
      400,
      400,
    );
    const created = await prisma.category.create({
      data: {
        name: node.name,
        slug: node.slug,
        description: node.description ?? `Shop ${node.name.toLowerCase()} on SeShaKart.`,
        seoContent: `Explore ${node.name.toLowerCase()} on SeShaKart with genuine products, secure payments and fast delivery across India. (Demo category.)`,
        parentId,
        depth,
        sortOrder: i,
        isFeatured: Boolean(node.featured),
        imageUrl,
      },
    });
    ids.set(node.slug, created.id);
    for (const [slug, id] of await createCategories(
      node.children ?? [],
      created.id,
      depth + 1,
      pal,
    ))
      ids.set(slug, id);
  }
  return ids;
}

function rootOf(slug: string): string {
  const find = (nodes: DemoCategory[], root?: string): string | undefined => {
    for (const n of nodes) {
      const r = root ?? n.slug;
      if (n.slug === slug) return r;
      const hit = find(n.children ?? [], r);
      if (hit) return hit;
    }
    return undefined;
  };
  return find(DEMO_CATEGORIES)!;
}

async function seed(): Promise<void> {
  await remove();
  const categoryIds = await createCategories(DEMO_CATEGORIES, null, 0);

  const brandIds = new Map<string, string>();
  for (const b of DEMO_BRANDS) {
    const brand = await prisma.brand.create({
      data: {
        name: b.name,
        slug: b.slug,
        isFeatured: b.featured,
        description: `${b.about} (Demo brand for illustration.)`,
      },
    });
    brandIds.set(b.slug, brand.id);
  }

  const now = Date.now();
  for (const [index, p] of DEMO_PRODUCTS.entries()) {
    const slug = slugify(p.name);
    const brand = DEMO_BRANDS.find((b) => b.slug === p.brand)!;
    const palette = PALETTES[rootOf(p.category)]!;
    const svg = icon(p.icon);
    const images = await Promise.all(
      ([0, 1] as const).map(async (view) => ({
        url: await saveImage(
          `${MEDIA_PREFIX}/products/${slug}-${view + 1}.webp`,
          await productImage(svg, palette, view),
          1000,
          1000,
        ),
        alt: view === 0 ? p.name : `${p.name} — alternate view`,
        width: 1000,
        height: 1000,
        position: view,
      })),
    );
    const skuBase = `${brand.name
      .replace(/[^A-Za-z]/g, '')
      .slice(0, 3)
      .toUpperCase()}-${String(index + 1).padStart(4, '0')}`;
    await prisma.product.create({
      data: {
        name: p.name,
        slug,
        sku: skuBase,
        shortDescription: p.short,
        description: [
          p.short,
          `${p.highlights.join('. ')}.`,
          'This is a demo product used to preview the SeShaKart store. It is not for sale.',
        ].join('\n\n'),
        categoryId: categoryIds.get(p.category)!,
        brandId: brandIds.get(p.brand)!,
        status: 'ACTIVE',
        isFeatured: Boolean(p.featured),
        taxRate: p.tax,
        hsnCode: p.hsn,
        highlights: p.highlights,
        tags: [DEMO_TAG, p.category],
        specifications: p.specs.map(([label, value]) => ({
          label,
          value,
        })) as Prisma.InputJsonValue,
        weightGrams: 500,
        shippingInfo: 'Usually ships within 1–2 business days. Free delivery on orders above ₹499.',
        returnInfo:
          p.returnDays === 0
            ? 'This item is not returnable for hygiene reasons. Damaged or wrong items are replaced.'
            : `Easy ${p.returnDays ?? 7}-day returns if the item is unused and in its original packaging.`,
        isReturnable: p.returnDays !== 0,
        returnWindowDays: p.returnDays ?? 7,
        warrantyInfo: p.warranty ?? null,
        soldCount: p.sold,
        publishedAt: new Date(now - p.daysAgo * 86_400_000),
        metaDescription: `${p.short} Buy ${p.name} online at SeShaKart.`,
        images: { create: images },
        variants: {
          create: p.variants.map((vr, i) => ({
            sku: `${skuBase}-${String(i + 1).padStart(2, '0')}`,
            name: vr.name,
            options: vr.options,
            mrp: vr.mrp * 100,
            price: vr.price * 100,
            isDefault: i === 0,
            position: i,
            inventory: { create: { stock: vr.stock, lowStockThreshold: 5 } },
          })),
        },
      },
    });
  }

  await prisma.banner.createMany({ data: DEMO_BANNERS.map((b) => ({ ...b })) });
  for (const [position, s] of DEMO_HOME_SECTIONS.entries()) {
    await prisma.homeSection.create({
      data: {
        title: s.title,
        subtitle: s.subtitle,
        source: s.source,
        position,
        limit: 12,
        categoryId: 'category' in s && s.category ? (categoryIds.get(s.category) ?? null) : null,
      },
    });
  }
  console.log(
    `Seeded demo catalogue: ${categoryIds.size} categories, ${brandIds.size} brands, ${DEMO_PRODUCTS.length} products, ` +
      `${DEMO_BANNERS.length} banners, ${DEMO_HOME_SECTIONS.length} homepage sections.`,
  );
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing to seed demo data in production (set ALLOW_DEMO_SEED=true for staging).',
    );
  }
  if (process.argv.includes('--remove')) await remove();
  else await seed();
  await clearCatalogCache();
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
