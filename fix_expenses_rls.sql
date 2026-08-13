-- Fix expenses RLS: "new row violates row-level security policy for table expenses"
--
-- The harden_rls_policies.sql run replaced every expenses policy with
-- inventory_team_only, which only admits role IN ('admin','staff'). Vendors
-- (and any profile where the helper check fails) are therefore blocked from
-- inserting expenses. This script restores per-operation policies that allow:
--   * admin / staff : full read, insert, update, delete
--   * vendor        : read + insert their own records (recorded_by = auth.uid())
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
  );

CREATE POLICY expenses_team_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_staff()
    OR (
      auth.uid() = recorded_by
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'vendor'
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