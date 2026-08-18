-- Backfill vendor_id on existing expenses so vendor teams can see each
-- other's ads/expenses in Profit, Finance and Expenses pages.
--
-- Before the vendor_id column existed, vendor expenses were only linked by
-- recorded_by. That means:
--   * the vendor owner could not see expenses recorded by their staff
--   * staff could not see expenses recorded by the vendor owner
-- RLS + page-level scoping then hides them from each other (vendor_id IS NULL).
--
-- Run this in the Supabase SQL editor as the project owner.

-- 1. Expenses recorded by vendor OWNERS (role='vendor'):
--    link them to the owner's own profile id.
UPDATE public.expenses e
SET vendor_id = p.id
FROM public.profiles p
WHERE e.recorded_by = p.id
  AND p.role = 'vendor'
  AND e.vendor_id IS NULL;

-- 2. Expenses recorded by vendor STAFF (role='staff' with a vendor_id):
--    link them to their vendor account so the whole team sees them.
UPDATE public.expenses e
SET vendor_id = p.vendor_id
FROM public.profiles p
WHERE e.recorded_by = p.id
  AND p.role = 'staff'
  AND p.vendor_id IS NOT NULL
  AND e.vendor_id IS NULL;

-- Verify after running:
-- SELECT
--   count(*) FILTER (WHERE vendor_id IS NULL) AS still_null,
--   count(*) FILTER (WHERE vendor_id IS NOT NULL) AS linked
-- FROM public.expenses;