-- Search vocabulary for typo correction: every distinct word (3+ characters) in live
-- product names and tags, active brands and active categories.
--
-- Search used to rebuild this list from the whole catalogue on every query (O(catalogue),
-- ~170 ms at 30,000 products). It is now materialised once and refreshed by the API after
-- catalogue changes (SearchService.ensureVocabulary), and looked up through indexes:
--   * trigram GiST → nearest word by similarity (KNN, `w <-> token`) and
--                    "is this token the start of a catalogue word?" (`w LIKE tok || '%'`)
CREATE MATERIALIZED VIEW "search_vocab" AS
SELECT DISTINCT w
FROM (
  SELECT unnest(regexp_split_to_array(lower(p."name" || ' ' || array_to_string(p."tags", ' ')), '[^a-z0-9]+')) AS w
  FROM "products" p WHERE p."status" = 'ACTIVE'
  UNION ALL
  SELECT unnest(regexp_split_to_array(lower(b."name"), '[^a-z0-9]+')) FROM "brands" b WHERE b."is_active"
  UNION ALL
  SELECT unnest(regexp_split_to_array(lower(c."name"), '[^a-z0-9]+')) FROM "categories" c WHERE c."is_active"
) words
WHERE length(w) > 2;

-- Unique index: required for REFRESH MATERIALIZED VIEW CONCURRENTLY (reads never block).
CREATE UNIQUE INDEX "search_vocab_w_key" ON "search_vocab" (w);
CREATE INDEX "search_vocab_w_trgm_idx" ON "search_vocab" USING GIST (w gist_trgm_ops);
