-- Fix expenses RLS + vendor team visibility
--
-- Problems:
--   1. expenses_team_select only admitted auth.uid() = recorded_by for
--      non-admin users, so vendor staff could never see the vendor owner's
--      expenses and vice-versa.
--   2. expenses_team_insert only admitted role 'vendor', so vendor staff
--      could not record expenses at all.
--
-- Run this in the Supabase SQL editor as the project owner.

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_or_staff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for expenses" ON public.expenses;
DROP POLICY IF EXISTS "Enable insert for expenses" ON public.expenses;
DROP POLICY IF EXISTS "Enable edit for admins" ON public.expenses;
DROP POLICY IF EXISTS inventory_team_only ON public.expenses;
DROP POLICY IF EXISTS expenses_team_select ON public.expenses;
DROP POLICY IF EXISTS expenses_team_insert ON public.expenses;
DROP POLICY IF EXISTS expenses_admin_update ON public.expenses;
DROP POLICY IF EXISTS expenses_admin_delete ON public.expenses;

-- SELECT:
--   * admin / main-store staff: everything EXCEPT vendor-recorded expenses
--   * vendors: their own records + everything linked to their vendor account
--     (vendor_id = their id for the owner, vendor_id = their profile's
--     vendor_id for vendor-created staff)
CREATE POLICY expenses_team_select ON public.expenses
  FOR SELECT TO authenticated
  USING (
    (
      public.is_admin_or_staff()
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = expenses.recorded_by AND p.role = 'vendor'
      )
    )
    OR auth.uid() = recorded_by
    OR expenses.vendor_id = auth.uid()
    OR expenses.vendor_id = (
      SELECT vendor_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- INSERT:
--   * admin / staff: full insert
--   * vendors: own records (recorded_by = auth.uid())
--   * vendor staff: own records scoped to their vendor account
CREATE POLICY expenses_team_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_staff()
    OR (
      auth.uid() = recorded_by
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles
          WHERE id = auth.uid() AND role = 'vendor'
        )
        OR expenses.vendor_id = (
          SELECT vendor_id FROM public.profiles WHERE id = auth.uid()
        )
      )
    )
  );

CREATE POLICY expenses_admin_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

CREATE POLICY expenses_admin_delete ON public.expenses
  FOR DELETE TO authenticated
  USING (public.is_admin_or_staff());

-- Verify after running:
-- SELECT policyname, roles, cmd FROM pg_policies WHERE tablename='expenses';