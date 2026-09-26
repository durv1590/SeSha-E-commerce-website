import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;
interface Row {
  stock: number;
  reserved: number;
}

/**
 * Stock movements for orders. Each is a single conditional UPDATE, so concurrent
 * checkouts can never oversell (the CHECK constraint on `inventory` is the last
 * line of defence), and each writes an entry to the inventory ledger.
 */

/** Holds `qty` units for an order. False when not enough are available. */
export async function reserve(
  tx: Tx,
  variantId: string,
  qty: number,
  orderId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "inventory" SET "reserved" = "reserved" + ${qty}, "updated_at" = now()
    WHERE "variant_id" = ${variantId} AND "stock" - "reserved" >= ${qty}
    RETURNING "stock", "reserved"`;
  if (!rows.length) return false;
  await tx.inventoryTransaction.create({
    data: {
      variantId,
      orderId,
      type: 'RESERVE',
      quantity: qty,
      stockAfter: rows[0]!.stock,
      reservedAfter: rows[0]!.reserved,
    },
  });
  return true;
}

/** Returns held units to sale (unpaid order expired or cancelled). */
export async function release(
  tx: Tx,
  variantId: string,
  qty: number,
  orderId: string,
  reason: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "inventory" SET "reserved" = GREATEST("reserved" - ${qty}, 0), "updated_at" = now()
    WHERE "variant_id" = ${variantId}
    RETURNING "stock", "reserved"`;
  if (!rows.length) return;
  await tx.inventoryTransaction.create({
    data: {
      variantId,
      orderId,
      type: 'RELEASE',
      quantity: qty,
      stockAfter: rows[0]!.stock,
      reservedAfter: rows[0]!.reserved,
      reason,
    },
  });
}

/** Converts held units into a sale (order confirmed): stock and reservation both drop. */
export async function sell(
  tx: Tx,
  line: { variantId: string; productId: string | null; quantity: number },
  orderId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "inventory"
    SET "stock" = "stock" - ${line.quantity}, "reserved" = "reserved" - ${line.quantity}, "updated_at" = now()
    WHERE "variant_id" = ${line.variantId} AND "reserved" >= ${line.quantity}
    RETURNING "stock", "reserved"`;
  if (!rows.length) throw new Error(`Reservation missing for variant ${line.variantId}`);
  await tx.inventoryTransaction.create({
    data: {
      variantId: line.variantId,
      orderId,
      type: 'SALE',
      quantity: -line.quantity,
      stockAfter: rows[0]!.stock,
      reservedAfter: rows[0]!.reserved,
    },
  });
  if (line.productId)
    await tx.product.update({
      where: { id: line.productId },
      data: { soldCount: { increment: line.quantity } },
    });
}

/**
 * Puts sold units back into stock: a confirmed order cancelled before shipping
 * (RESTOCK) or goods returned by the customer or the courier (RETURN).
 */
export async function restock(
  tx: Tx,
  line: { variantId: string; productId: string | null; quantity: number },
  orderId: string,
  type: 'RESTOCK' | 'RETURN',
  reason: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Row[]>`
    UPDATE "inventory" SET "stock" = "stock" + ${line.quantity}, "updated_at" = now()
    WHERE "variant_id" = ${line.variantId}
    RETURNING "stock", "reserved"`;
  if (!rows.length) return; // variant deleted since: nothing to put back
  await tx.inventoryTransaction.create({
    data: {
      variantId: line.variantId,
      orderId,
      type,
      quantity: line.quantity,
      stockAfter: rows[0]!.stock,
      reservedAfter: rows[0]!.reserved,
      reason,
    },
  });
  if (line.productId)
    await tx.$executeRaw`UPDATE "products" SET "sold_count" = GREATEST("sold_count" - ${line.quantity}, 0) WHERE "id" = ${line.productId}`;
}
