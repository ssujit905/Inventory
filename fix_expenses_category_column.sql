-- =============================================================================
-- FIX: "Could not find the 'category' column of 'expenses' in the schema cache"
-- =============================================================================
-- The desktop/mobile Expenses pages and Reports pages read and write
-- expenses.category ('ads' | 'packaging' | 'other'), and the expense form
-- also sends vendor_id — but no migration ever created the category column
-- (restore_full_schema.sql defines expenses WITHOUT it), so PostgREST
-- rejects every expenses query/insert against a DB built from that schema.
--
-- Idempotent: safe to re-run any time. Existing rows get category = 'other'.
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor as project owner,
-- then wait ~30s for PostgREST to reload its schema cache before retrying.
-- If the error persists, run: NOTIFY pgrst, 'reload schema';
-- =============================================================================

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Belt-and-braces: the DEFAULT above backfills existing rows, this covers
-- any NULLs written through other paths.
UPDATE public.expenses SET category = 'other' WHERE category IS NULL;

-- =============================================================================
-- VERIFY (Supabase SQL Editor, after applying):
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'expenses'
--   ORDER BY ordinal_position;
--   -- expect: category | text | 'other'::text
-- =============================================================================
