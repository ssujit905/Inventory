-- =============================================================================
-- FIX: Supabase Security Advisor - Table has RLS enabled, but no policies exist
-- =============================================================================
-- Entity: public.website_customers (and any other table missing policies)
-- Issue: Table has RLS enabled, but no policies exist
--
-- Explanation:
--   When RLS is enabled without any policies, PostgreSQL denies all direct
--   access to the table by non-superusers. Supabase flags this because tables
--   should have intentional, explicit policies defining who can access them.
--
-- Resolution:
--   1. Adds an admin/staff management policy to public.website_customers,
--      allowing authenticated admins/staff to manage customer records, while
--      keeping customer data private from unauthenticated users.
--      Customer web operations continue safely via SECURITY DEFINER functions.
--   2. Dynamically finds ANY other table in 'public' that has RLS enabled but
--      no policies, and adds the same secure admin/staff management policy.
--   3. Verifies 0 tables remain without policies.
-- =============================================================================

-- Ensure helper function exists
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

REVOKE ALL ON FUNCTION public.is_admin_or_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;

-- ── 1. EXPLICIT POLICIES FOR CUSTOMERS & ORDERS TABLES ───────────────────────

-- website_customers
DO $$
BEGIN
  IF to_regclass('public.website_customers') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_staff_manage" ON public.website_customers;
    CREATE POLICY "admin_staff_manage" ON public.website_customers
      FOR ALL TO authenticated
      USING (public.is_admin_or_staff())
      WITH CHECK (public.is_admin_or_staff());
  END IF;
END;
$$;

-- website_orders
DO $$
BEGIN
  IF to_regclass('public.website_orders') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_staff_manage" ON public.website_orders;
    CREATE POLICY "admin_staff_manage" ON public.website_orders
      FOR ALL TO authenticated
      USING (public.is_admin_or_staff())
      WITH CHECK (public.is_admin_or_staff());
  END IF;
END;
$$;

-- website_order_items
DO $$
BEGIN
  IF to_regclass('public.website_order_items') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_staff_manage" ON public.website_order_items;
    CREATE POLICY "admin_staff_manage" ON public.website_order_items
      FOR ALL TO authenticated
      USING (public.is_admin_or_staff())
      WITH CHECK (public.is_admin_or_staff());
  END IF;
END;
$$;

-- website_order_returns
DO $$
BEGIN
  IF to_regclass('public.website_order_returns') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admin_staff_manage" ON public.website_order_returns;
    CREATE POLICY "admin_staff_manage" ON public.website_order_returns
      FOR ALL TO authenticated
      USING (public.is_admin_or_staff())
      WITH CHECK (public.is_admin_or_staff());
  END IF;
END;
$$;

-- ── 2. CATCH-ALL: ADD ADMIN/STAFF POLICY TO ANY TABLE LACKING POLICIES ───────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables t
    WHERE schemaname = 'public'
      AND rowsecurity = true
      AND NOT EXISTS (
        SELECT 1
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = t.tablename
      )
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY "admin_staff_manage" ON public.%I FOR ALL TO authenticated USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());',
        r.tablename
      );
      RAISE NOTICE 'Added admin_staff_manage policy to public.%', r.tablename;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping public.%: %', r.tablename, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ── 3. VERIFICATION QUERY ────────────────────────────────────────────────────
-- Must return 0 rows
SELECT
  schemaname,
  tablename
FROM pg_tables t
WHERE schemaname = 'public'
  AND rowsecurity = true
  AND NOT EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename = t.tablename
  );
