/**
 * Query normalisation and synonym expansion for product search.
 * Output tokens contain only [a-z0-9], so they are always safe inside a tsquery.
 */

export const MAX_QUERY_LENGTH = 100;
const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 30;

/** Lower-cases, strips punctuation (hyphens split words: "t-shirt" → "t shirt") and collapses spaces. */
export function normalizeQuery(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_QUERY_LENGTH);
}

export function tokenize(normalized: string): string[] {
  return [
    ...new Set(
      normalized
        .split(' ')
        .filter(Boolean)
        .map((t) => t.slice(0, MAX_TOKEN_LENGTH)),
    ),
  ].slice(0, MAX_TOKENS);
}

/**
 * Everyday Indian-English shopping synonyms. Each entry expands to alternatives
 * that are ORed in the query ("phone" also finds "smartphone"). Kept small and
 * explicit; an admin-managed list can replace it later.
 */
export const SYNONYMS: Record<string, string[]> = {
  tshirt: ['shirt'],
  tshirts: ['shirt'],
  tee: ['shirt'],
  tees: ['shirt'],
  mobile: ['smartphone', 'phone'],
  mobiles: ['smartphone', 'phone'],
  phone: ['smartphone'],
  phones: ['smartphone'],
  cellphone: ['smartphone'],
  earphone: ['earbuds', 'headphones'],
  earphones: ['earbuds', 'headphones'],
  headset: ['headphones', 'earbuds'],
  tws: ['earbuds'],
  airpods: ['earbuds'],
  watch: ['smartwatch'],
  fitnessband: ['band', 'tracker'],
  powerbank: ['power', 'bank'],
  charger: ['charger', 'charging'],
  sneaker: ['sneakers', 'shoes'],
  sneakers: ['shoes'],
  footwear: ['shoes'],
  kurti: ['kurta'],
  kurtis: ['kurta'],
  mixie: ['mixer', 'grinder'],
  mixi: ['mixer', 'grinder'],
  kadhai: ['kadai'],
  kadahi: ['kadai'],
  sunscreen: ['spf', 'sunscreen'],
  facewash: ['face', 'wash'],
};

/** One group per token: the token plus its synonyms (all must be [a-z0-9]). */
export function expandTokens(tokens: string[]): string[][] {
  return tokens.map((t) => [...new Set([t, ...(SYNONYMS[t] ?? [])])]);
}

/**
 * Builds a PostgreSQL tsquery string: every token must match (AND), a token matches
 * itself or a synonym (OR), and each term is a prefix so "ear" finds "earbuds".
 */
export function toPrefixTsQuery(groups: string[][]): string {
  return groups.map((alts) => `(${alts.map((a) => `${a}:*`).join(' | ')})`).join(' & ');
}

/** Queries that look like personal data are never stored in search analytics. */
export function looksPersonal(raw: string): boolean {
  return (
    /\S+@\S+\.\S+/.test(raw) || // email
    /(?:\d[\s-]?){8,}/.test(raw) || // phone / card / order-like number
    /https?:\/\/|www\./i.test(raw) // URL
  );
}
