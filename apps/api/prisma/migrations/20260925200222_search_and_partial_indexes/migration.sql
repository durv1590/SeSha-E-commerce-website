-- Indexes Prisma's schema language cannot express. Prisma Migrate ignores
-- indexes it does not know about, so these persist across future migrations.

-- At most one default address per user, one default variant per product.
CREATE UNIQUE INDEX "addresses_one_default_per_user_idx" ON "addresses" ("user_id") WHERE "is_default";
CREATE UNIQUE INDEX "product_variants_one_default_idx" ON "product_variants" ("product_id") WHERE "is_default";

-- Full-text search (see sk_product_search_document in the init migration).
CREATE INDEX "products_search_document_idx" ON "products"
  USING GIN (sk_product_search_document("name", "short_description", "tags", "highlights"));

-- Trigram indexes for typo-tolerant autocomplete on brands, categories and popular searches.
CREATE INDEX "brands_name_trgm_idx" ON "brands" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "categories_name_trgm_idx" ON "categories" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "search_queries_query_trgm_idx" ON "search_queries" USING GIN ("query" gin_trgm_ops);

-- Only live products are listed; a partial index keeps listing queries small.
CREATE INDEX "products_active_listing_idx" ON "products" ("category_id", "sold_count" DESC) WHERE "status" = 'ACTIVE';

-- Low-stock dashboard query.
CREATE INDEX "inventory_available_idx" ON "inventory" (("stock" - "reserved"));
