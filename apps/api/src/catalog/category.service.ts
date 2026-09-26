import { HttpStatus, Injectable } from '@nestjs/common';
import type { Category } from '@prisma/client';
import type { CategoryDetail, CategoryNode, CategoryRef } from '@seshakart/types';
import { CacheService } from '../cache/cache.service';
import { AppException } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../database/prisma.service';

export const CATALOG_CACHE_PREFIX = 'catalog:';
const TREE_TTL = 300;
/** Read several times per listing request: keep it parsed in-process (see WrapOptions). */
export const HOT_LOCAL = { localSeconds: 10 };

export interface TreeIndex {
  roots: CategoryNode[];
  /** slug → node, parentId, and the ids of the node plus all descendants. */
  bySlug: Record<string, { node: CategoryNode; parentSlug: string | null; subtreeIds: string[] }>;
  byId: Record<string, string>;
}

/**
 * Category tree (category → subcategory → sub-subcategory). Built once from the
 * database and cached; inactive categories and their subtrees are hidden.
 */
@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async index(): Promise<TreeIndex> {
    return this.cache.wrap(
      `${CATALOG_CACHE_PREFIX}tree`,
      TREE_TTL,
      async () => {
        const rows = await this.prisma.category.findMany({
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
        return buildIndex(rows);
      },
      HOT_LOCAL,
    );
  }

  async tree(): Promise<CategoryNode[]> {
    return (await this.index()).roots;
  }

  async subtreeIds(slug: string): Promise<string[] | null> {
    return (await this.index()).bySlug[slug]?.subtreeIds ?? null;
  }

  async breadcrumbsForId(categoryId: string): Promise<CategoryRef[]> {
    const idx = await this.index();
    const slug = idx.byId[categoryId];
    return slug ? path(idx, slug) : [];
  }

  async detail(slug: string): Promise<CategoryDetail> {
    const idx = await this.index();
    const entry = idx.bySlug[slug];
    if (!entry)
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'This category is not available.');
    const row = await this.prisma.category.findUniqueOrThrow({ where: { slug } });
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      seoContent: row.seoContent,
      imageUrl: row.imageUrl,
      bannerUrl: row.bannerUrl,
      metaTitle: row.metaTitle,
      metaDescription: row.metaDescription,
      breadcrumbs: path(idx, slug),
      children: entry.node.children.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        imageUrl: c.imageUrl,
      })),
    };
  }

  /** Featured categories for the homepage (any depth), falling back to top-level ones. */
  async featured(limit = 12): Promise<CategoryNode[]> {
    const idx = await this.index();
    const all = Object.values(idx.bySlug).map((e) => e.node);
    const featured = all.filter((n) => n.isFeatured);
    return (featured.length ? featured : idx.roots)
      .slice(0, limit)
      .map((n) => ({ ...n, children: [] }));
  }
}

function path(idx: TreeIndex, slug: string): CategoryRef[] {
  const out: CategoryRef[] = [];
  let current: string | null = slug;
  while (current && idx.bySlug[current]) {
    const entry: TreeIndex['bySlug'][string] = idx.bySlug[current]!;
    const { node, parentSlug } = entry;
    out.unshift({ id: node.id, name: node.name, slug: node.slug });
    current = parentSlug;
  }
  return out;
}

export function buildIndex(rows: Category[]): TreeIndex {
  const nodes = new Map<string, CategoryNode>();
  for (const r of rows) {
    nodes.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      imageUrl: r.imageUrl,
      isFeatured: r.isFeatured,
      children: [],
    });
  }
  const roots: CategoryNode[] = [];
  const parentOf = new Map<string, string | null>();
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (!r.parentId) {
      roots.push(node);
      parentOf.set(r.id, null);
    } else if (nodes.has(r.parentId)) {
      nodes.get(r.parentId)!.children.push(node);
      parentOf.set(r.id, r.parentId);
    }
    // A child of an inactive parent is dropped (its whole subtree is hidden).
  }

  const index: TreeIndex = { roots, bySlug: {}, byId: {} };
  const visit = (node: CategoryNode, parentSlug: string | null): string[] => {
    const ids = [node.id, ...node.children.flatMap((c) => visit(c, node.slug))];
    index.bySlug[node.slug] = { node, parentSlug, subtreeIds: ids };
    index.byId[node.id] = node.slug;
    return ids;
  };
  roots.forEach((r) => visit(r, null));
  return index;
}
