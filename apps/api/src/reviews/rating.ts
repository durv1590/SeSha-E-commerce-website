import type { Prisma } from '@prisma/client';

/** Recomputes a product's rating from its APPROVED reviews only. */
export async function recomputeRating(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "products" p SET
      "rating_avg" = COALESCE(r.avg, 0),
      "rating_count" = COALESCE(r.n, 0)
    FROM (
      SELECT round(avg("rating")::numeric, 2)::float8 AS avg, count(*)::int AS n
      FROM "reviews" WHERE "product_id" = ${productId} AND "status" = 'APPROVED'
    ) r
    WHERE p."id" = ${productId}`;
}

/** Public display name: first name and last initial ("Asha Rao" → "Asha R."). */
export function reviewerName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Customer';
  const first = parts[0]!.slice(0, 30);
  return parts.length > 1 ? `${first} ${parts.at(-1)![0]!.toUpperCase()}.` : first;
}
