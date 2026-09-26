import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PopularSearches, SearchSuggestions } from '@seshakart/types';
import { CacheService } from '../cache/cache.service';
import { CATALOG_CACHE_PREFIX, CategoryService } from '../catalog/category.service';
import { PrismaService } from '../database/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  expandTokens,
  looksPersonal,
  normalizeQuery,
  toPrefixTsQuery,
  tokenize,
} from './normalize';

/** Ranked product ids for a query, plus the corrected query when a typo was fixed. */
export interface SearchResult {
  ids: string[];
  correctedQuery: string | null;
}

export type SuggestionsDto = SearchSuggestions;
export type PopularSearchesDto = PopularSearches;

/**
 * Search engine contract. The PostgreSQL implementation below is the default; a
 * dedicated engine (OpenSearch, Meilisearch, Algolia) or a semantic/vector search
 * for the future AI shopping assistant can implement the same interface without
 * touching the catalogue or the storefront.
 */
export interface SearchEngine {
  search(query: string): Promise<SearchResult>;
}

const MAX_RESULTS = 500;
const SEARCH_TTL = 120;
const TYPO_MIN_SIMILARITY = 0.3;
const FUZZY_MIN_WORD_SIMILARITY = 0.45;

/**
 * PostgreSQL search:
 * 1. Normalise → tokens (only [a-z0-9]) → synonyms.
 * 2. Tokens matching a brand name become a brand constraint ("aurora earbuds").
 * 3. Weighted full-text search with prefix matching over name (A), tags (B),
 *    short description (C) and highlights (D), using the GIN expression index.
 * 4. No hits → correct each unknown token against the live catalogue vocabulary
 *    (trigram similarity) and retry: "earbds" → "earbuds".
 * 5. Still nothing → trigram word similarity on product names.
 * Ranking blends text rank, a name-prefix boost, popularity and availability.
 */
@Injectable()
export class SearchService implements SearchEngine {
  private readonly logger = new Logger('Search');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly categories: CategoryService,
    private readonly settings: SettingsService,
  ) {}

  async search(raw: string): Promise<SearchResult> {
    const normalized = normalizeQuery(raw);
    if (!normalized) return { ids: [], correctedQuery: null };
    return this.cache.wrap(`${CATALOG_CACHE_PREFIX}search:${normalized}`, SEARCH_TTL, () =>
      this.run(normalized),
    );
  }

  private async activeCategoryIds(): Promise<string[]> {
    return Object.values((await this.categories.index()).bySlug).map((e) => e.node.id);
  }

  /** Brands whose name contains a query token as a whole-word prefix (token ≥ 3 chars). */
  private async brandMatches(
    tokens: string[],
  ): Promise<{ brandIds: string[]; consumed: string[] }> {
    const candidates = tokens.filter((t) => t.length >= 3);
    if (!candidates.length) return { brandIds: [], consumed: [] };
    const brands = await this.prisma.brand.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const brandIds = new Set<string>();
    const consumed = new Set<string>();
    for (const b of brands) {
      const words = normalizeQuery(b.name).split(' ');
      for (const t of candidates) {
        if (words.some((w) => w.startsWith(t))) {
          brandIds.add(b.id);
          consumed.add(t);
        }
      }
    }
    return { brandIds: [...brandIds], consumed: [...consumed] };
  }

  private async fullText(
    tokens: string[],
    brandIds: string[],
    categoryIds: string[],
    normalized: string,
  ): Promise<string[]> {
    const conditions: Prisma.Sql[] = [
      Prisma.sql`p."status" = 'ACTIVE'`,
      Prisma.sql`p."category_id" = ANY(${categoryIds})`,
    ];
    if (brandIds.length) conditions.push(Prisma.sql`p."brand_id" = ANY(${brandIds})`);
    const tsq = tokens.length ? toPrefixTsQuery(expandTokens(tokens)) : null;
    if (tsq)
      conditions.push(
        Prisma.sql`sk_product_search_document(p."name", p."short_description", p."tags", p."highlights") @@ to_tsquery('simple', ${tsq})`,
      );
    if (!tsq && !brandIds.length) return [];

    const rank = tsq
      ? Prisma.sql`ts_rank_cd(sk_product_search_document(p."name", p."short_description", p."tags", p."highlights"), to_tsquery('simple', ${tsq}), 32)`
      : Prisma.sql`0`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id"
      FROM "products" p
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY
        ${rank}
        + CASE WHEN lower(p."name") LIKE ${`${normalized.split(' ')[0]}%`} THEN 0.3 ELSE 0 END
        + word_similarity(${normalized}, lower(p."name")) * 0.3
        + ln(1 + p."sold_count") * 0.02
        + CASE WHEN p."available_stock" > 0 THEN 0.15 ELSE 0 END DESC,
        p."id"
      LIMIT ${MAX_RESULTS}`;
    return rows.map((r) => r.id);
  }

  /**
   * Replaces tokens that don't occur in the catalogue with the closest real word.
   * `unknown` is true when any token isn't a catalogue word (corrected or not).
   */
  private async correct(
    tokens: string[],
  ): Promise<{ corrected: string[] | null; unknown: boolean }> {
    if (!tokens.length) return { corrected: null, unknown: false };
    const rows = await this.prisma.$queryRaw<
      { tok: string; best: string | null; sim: number | null; known: boolean }[]
    >`
      WITH vocab AS (
        SELECT DISTINCT w FROM (
          SELECT unnest(regexp_split_to_array(lower(p."name" || ' ' || array_to_string(p."tags", ' ')), '[^a-z0-9]+')) AS w
          FROM "products" p WHERE p."status" = 'ACTIVE'
          UNION ALL SELECT unnest(regexp_split_to_array(lower(b."name"), '[^a-z0-9]+')) FROM "brands" b WHERE b."is_active"
          UNION ALL SELECT unnest(regexp_split_to_array(lower(c."name"), '[^a-z0-9]+')) FROM "categories" c WHERE c."is_active"
        ) words WHERE length(w) > 2
      )
      SELECT t.tok,
             (SELECT w FROM vocab ORDER BY similarity(w, t.tok) DESC, w LIMIT 1) AS best,
             (SELECT max(similarity(w, t.tok)) FROM vocab) AS sim,
             EXISTS (SELECT 1 FROM vocab WHERE w LIKE t.tok || '%') AS known
      FROM unnest(${tokens}::text[]) AS t(tok)`;
    let changed = false;
    const unknown = rows.some((r) => !r.known);
    const corrected = rows.map((r) => {
      if (r.known || !r.best || (r.sim ?? 0) < TYPO_MIN_SIMILARITY) return r.tok;
      changed = true;
      return r.best;
    });
    return { corrected: changed ? corrected : null, unknown };
  }

  private async fuzzy(normalized: string, categoryIds: string[]): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id" FROM "products" p
      WHERE p."status" = 'ACTIVE' AND p."category_id" = ANY(${categoryIds})
        AND word_similarity(${normalized}, lower(p."name")) >= ${FUZZY_MIN_WORD_SIMILARITY}
      ORDER BY word_similarity(${normalized}, lower(p."name")) DESC, p."sold_count" DESC, p."id"
      LIMIT 50`;
    return rows.map((r) => r.id);
  }

  private async run(normalized: string): Promise<SearchResult> {
    const tokens = tokenize(normalized);
    const categoryIds = await this.activeCategoryIds();
    const { brandIds, consumed } = await this.brandMatches(tokens);
    const rest = tokens.filter((t) => !consumed.includes(t));

    // Brand + remaining words first; if that's empty, treat every word as text.
    let ids = await this.fullText(rest, brandIds, categoryIds, normalized);
    if (!ids.length && brandIds.length)
      ids = await this.fullText(tokens, [], categoryIds, normalized);
    if (ids.length) return { ids, correctedQuery: null };

    const { corrected, unknown } = await this.correct(tokens);
    if (corrected) {
      const fixed = corrected.join(' ');
      const retry = await this.brandMatches(corrected);
      ids = await this.fullText(
        corrected.filter((t) => !retry.consumed.includes(t)),
        retry.brandIds,
        categoryIds,
        fixed,
      );
      if (ids.length) return { ids, correctedQuery: fixed };
    }
    // Every word is a real catalogue word, they just don't occur together: an empty
    // result beats misleading partial matches. Otherwise try close product names.
    if (!unknown) return { ids: [], correctedQuery: null };
    return { ids: await this.fuzzy(normalized, categoryIds), correctedQuery: null };
  }

  // ------------------------------------------------------------------ suggestions

  async suggest(raw: string): Promise<SuggestionsDto> {
    const normalized = normalizeQuery(raw);
    if (!normalized) return { query: '', products: [], categories: [], brands: [], queries: [] };
    return this.cache.wrap(`${CATALOG_CACHE_PREFIX}suggest:${normalized}`, 60, async () => {
      const [{ ids }, idx, brands, queries] = await Promise.all([
        this.search(normalized),
        this.categories.index(),
        this.prisma.brand.findMany({
          where: { isActive: true },
          select: { id: true, name: true, slug: true },
        }),
        this.completions(normalized),
      ]);
      const top = ids.slice(0, 6);
      const rows = top.length
        ? await this.prisma.product.findMany({
            where: { id: { in: top } },
            select: {
              id: true,
              slug: true,
              name: true,
              minPrice: true,
              images: {
                orderBy: { position: 'asc' },
                take: 1,
                select: { url: true, alt: true, width: true, height: true },
              },
            },
          })
        : [];
      const byId = new Map(rows.map((r) => [r.id, r]));
      const matches = (name: string) => {
        const n = normalizeQuery(name);
        return (
          n.includes(normalized) ||
          normalized.split(' ').every((t) => n.split(' ').some((w) => w.startsWith(t)))
        );
      };
      return {
        query: normalized,
        products: top
          .map((id) => byId.get(id))
          .filter((r): r is NonNullable<typeof r> => Boolean(r))
          .map((r) => ({
            id: r.id,
            slug: r.slug,
            name: r.name,
            image: r.images[0] ?? null,
            price: r.minPrice,
          })),
        categories: Object.values(idx.bySlug)
          .map((e) => e.node)
          .filter((c) => matches(c.name))
          .slice(0, 4)
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
        brands: brands.filter((b) => matches(b.name)).slice(0, 3),
        queries,
      };
    });
  }

  /** Real searches starting with the typed text that returned results. */
  private async completions(normalized: string): Promise<string[]> {
    const { popularMinCount } = await this.settings.get('search');
    const rows = await this.prisma.searchQuery.findMany({
      where: {
        query: { startsWith: normalized },
        count: { gte: popularMinCount },
        lastResultCount: { gt: 0 },
        NOT: { query: normalized },
      },
      orderBy: { count: 'desc' },
      take: 4,
      select: { query: true },
    });
    return rows.map((r) => r.query);
  }

  async popular(): Promise<PopularSearchesDto> {
    return this.cache.wrap(`${CATALOG_CACHE_PREFIX}popular-searches`, 600, async () => {
      const search = await this.settings.get('search');
      const rows = await this.prisma.searchQuery.findMany({
        where: { count: { gte: search.popularMinCount }, lastResultCount: { gt: 0 } },
        orderBy: { count: 'desc' },
        take: 8,
        select: { query: true },
      });
      return { trending: search.trending, popular: rows.map((r) => r.query) };
    });
  }

  /**
   * Aggregated, anonymous search analytics (no user or session identifiers).
   * Queries that look like personal data are never stored.
   */
  async record(raw: string, resultCount: number): Promise<void> {
    const normalized = normalizeQuery(raw);
    if (normalized.length < 2 || looksPersonal(raw)) return;
    try {
      await this.prisma.searchQuery.upsert({
        where: { query: normalized },
        create: { query: normalized, lastResultCount: resultCount },
        update: {
          count: { increment: 1 },
          lastResultCount: resultCount,
          lastSearchedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.warn(`Could not record search: ${(err as Error).message}`);
    }
  }
}
