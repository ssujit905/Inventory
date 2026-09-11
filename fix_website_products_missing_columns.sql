-- =============================================================================
-- FIX: website product saves fail with schema-cache errors
-- =============================================================================
-- PROBLEM:
--   Desktop/mobile WebsiteProductsPage inserts/updates website_products with
--   columns the table does not have, so every product save dies with:
--     "Could not find the 'is_cod' column of 'website_products'
--      in the schema cache"
--   Missing columns (all present in app code + website reads, absent in DB):
--     is_cod, is_featured, show_shopinepal, video_url
--   (is_prepaid / is_prebook / allow_cod / allow_esewa / allow_fonepay
--   already exist — untouched.)
--
-- FIX: add the columns with defaults matching app behavior:
--   - is_cod TRUE            (form default true; website shows COD unless false)
--   - is_featured FALSE      (form default false)
--   - show_shopinepal TRUE   (form default true; website shows unless false)
--   - video_url NULL         (optional)
-- ADD COLUMN ... DEFAULT backfills existing rows, so current products keep
-- behaving exactly as the website already renders them.
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor. Idempotent.
-- NOTE: PostgREST caches the schema — if the error persists right after
-- applying, wait ~1 minute or restart the Supabase project / reload schema.
-- =============================================================================

ALTER TABLE public.website_products
  ADD COLUMN IF NOT EXISTS is_cod BOOLEAN DEFAULT TRUE;
ALTER TABLE public.website_products
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;
ALTER TABLE public.website_products
  ADD COLUMN IF NOT EXISTS show_shopinepal BOOLEAN DEFAULT TRUE;
ALTER TABLE public.website_products
  ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT NULL;

-- Ensure pre-existing rows (incl. ones created while the column default
-- only applied to new rows on some Postgres versions) match app behavior.
UPDATE public.website_products SET is_cod = TRUE WHERE is_cod IS NULL;
UPDATE public.website_products SET is_featured = FALSE WHERE is_featured IS NULL;
UPDATE public.website_products SET show_shopinepal = TRUE WHERE show_shopinepal IS NULL;

-- =============================================================================
-- VERIFY:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'website_products'
--     AND column_name IN ('is_cod','is_featured','show_shopinepal','video_url');
--   -- expect 4 rows. Then retry the product save in the desktop app.
-- =============================================================================
