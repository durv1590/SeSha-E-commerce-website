-- AlterTable
ALTER TABLE "products" ADD COLUMN     "available_stock" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "min_price_mrp" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_status_available_stock_idx" ON "products"("status", "available_stock");

-- CreateIndex
CREATE INDEX "products_status_max_discount_pct_idx" ON "products"("status", "max_discount_pct" DESC);


-- =====================================================================
-- Product aggregates maintained by triggers.
-- Listing pages filter and sort on min_price / max_discount_pct /
-- available_stock without joining variants and inventory. Triggers keep
-- them correct for EVERY write path (catalogue admin, checkout
-- reservations, returns, direct SQL) — application code never has to
-- remember to update them.
-- =====================================================================

CREATE FUNCTION sk_refresh_product_aggregates(p_product_id text) RETURNS void
LANGUAGE sql AS $$
  UPDATE "products" p SET
    "min_price"        = COALESCE(agg.min_price, 0),
    "min_price_mrp"    = COALESCE(agg.min_price_mrp, 0),
    "max_discount_pct" = COALESCE(agg.max_discount, 0),
    "available_stock"  = COALESCE(agg.available, 0)
  FROM (
    SELECT
      MIN(v."price") AS min_price,
      (ARRAY_AGG(v."mrp" ORDER BY v."price", v."mrp" DESC))[1] AS min_price_mrp,
      MAX(FLOOR((v."mrp" - v."price") * 100.0 / NULLIF(v."mrp", 0)))::int AS max_discount,
      SUM(GREATEST(COALESCE(i."stock", 0) - COALESCE(i."reserved", 0), 0))::int AS available
    FROM "product_variants" v
    LEFT JOIN "inventory" i ON i."variant_id" = v."id"
    WHERE v."product_id" = p_product_id AND v."is_active"
  ) agg
  WHERE p."id" = p_product_id;
$$;

CREATE FUNCTION sk_variant_aggregates_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM sk_refresh_product_aggregates(OLD."product_id"); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW."product_id" IS DISTINCT FROM OLD."product_id") THEN
    PERFORM sk_refresh_product_aggregates(NEW."product_id");
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "product_variants_aggregates"
  AFTER INSERT OR DELETE OR UPDATE OF "price", "mrp", "is_active", "product_id" ON "product_variants"
  FOR EACH ROW EXECUTE FUNCTION sk_variant_aggregates_trigger();

CREATE FUNCTION sk_inventory_aggregates_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE pid text;
BEGIN
  SELECT "product_id" INTO pid FROM "product_variants"
    WHERE "id" = COALESCE(NEW."variant_id", OLD."variant_id");
  IF pid IS NOT NULL THEN PERFORM sk_refresh_product_aggregates(pid); END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "inventory_aggregates"
  AFTER INSERT OR DELETE OR UPDATE OF "stock", "reserved", "variant_id" ON "inventory"
  FOR EACH ROW EXECUTE FUNCTION sk_inventory_aggregates_trigger();

-- Backfill existing rows.
SELECT sk_refresh_product_aggregates("id") FROM "products";
