-- =============================================================================
-- FIX: image saves fail with "Could not find the 'label' column of
-- 'website_product_images' in the schema cache"
-- =============================================================================
-- PROBLEM: app code reads/writes website_product_images.label (variation
-- labels shown on the website gallery), but the column does not exist.
-- Every image insert/update carrying a label dies with a schema-cache error.
--
-- FIX: add label TEXT DEFAULT ''. Empty default preserves current behavior
-- (website treats missing labels as the default variation).
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor. Idempotent.
-- NOTE: PostgREST caches the schema — if the error persists right after
-- applying, wait ~1 minute for the cache to reload, then retry.
-- =============================================================================

ALTER TABLE public.website_product_images
  ADD COLUMN IF NOT EXISTS label TEXT DEFAULT '';

UPDATE public.website_product_images SET label = '' WHERE label IS NULL;

-- VERIFY:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'website_product_images'
--     AND column_name = 'label';
--   -- expect 1 row.
-- =============================================================================
