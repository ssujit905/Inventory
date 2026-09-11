-- =============================================================================
-- FIX: Storefront 401 "permission denied for function current_vendor_id /
--      is_admin_or_staff" on website_products + website_settings
-- =============================================================================
-- Symptom:
--   GET /rest/v1/website_products?select=*,website_product_images(*)
--   -> 401, body: {"code":"42501","message":"permission denied for function
--      current_vendor_id"}
--   GET /rest/v1/website_settings -> 401 permission denied for is_admin_or_staff
--   website_product_images / variants / delivery_branches still work (USING(true)).
--
-- Root cause:
--   fix_all_database_linter_issues.sql revoked EXECUTE on the SECURITY DEFINER
--   helpers public.is_admin_or_staff() and public.current_vendor_id() from anon
--   (to silence the Supabase linter "anon_security_definer_function_executable").
--   But the storefront SELECT policies are `FOR SELECT TO anon, authenticated
--   USING (... OR public.is_admin_or_staff() OR ... current_vendor_id())`.
--   Every anon SELECT must evaluate those functions -> Postgres raises 42501 ->
--   PostgREST returns 401. Anon can never be admin/staff anyway (auth.uid() IS
--   NULL), so the admin branch is dead code for anon and only breaks the shop.
--
-- Fix (keeps the linter happy):
--   Split the storefront policies by role. Anon policies contain NO function
--   calls (plain column filters only). Authenticated policies keep the
--   admin/vendor branches (authenticated still has EXECUTE on the helpers).
--   Do NOT re-grant the helpers to anon.
--
-- HOW TO APPLY: Supabase Dashboard -> SQL Editor -> New query -> paste whole
-- file -> Run. Then re-test the website. No app code change needed.
-- =============================================================================

-- ── 0. Table-level grants (idempotent, RLS still applies) ────────────────────
GRANT SELECT ON public.website_products TO anon, authenticated;
GRANT SELECT ON public.website_settings TO anon, authenticated;
GRANT SELECT ON public.website_product_images TO anon, authenticated;

-- ── 1. website_products: drop every existing policy, recreate clean set ──────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'website_products'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.website_products', r.policyname);
  END LOOP;
END;
$$;

-- Anon (public storefront): active products only. No function calls, so anon
-- never needs EXECUTE on is_admin_or_staff()/current_vendor_id().
CREATE POLICY storefront_anon_read_active_products
ON public.website_products
FOR SELECT
TO anon
USING (is_active = TRUE);

-- Logged-in users (customers browsing + staff/vendors in admin apps): active
-- products for everyone, plus inactive/drafts for team members and owners.
-- Authenticated role retains EXECUTE on both helpers (see
-- fix_all_database_linter_issues.sql step 4), so this evaluates fine.
CREATE POLICY storefront_auth_read_products
ON public.website_products
FOR SELECT
TO authenticated
USING (
  is_active = TRUE
  OR public.is_admin_or_staff()
  OR vendor_id = public.current_vendor_id()
);

-- Staff/admin full write access.
CREATE POLICY "Admin staff full access website products"
ON public.website_products
FOR ALL
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

-- Vendors manage their own products.
CREATE POLICY "Vendors manage own website products"
ON public.website_products
FOR ALL
TO authenticated
USING (vendor_id = public.current_vendor_id())
WITH CHECK (vendor_id = public.current_vendor_id());

-- ── 2. website_settings: same split ──────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'website_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.website_settings', r.policyname);
  END LOOP;
END;
$$;

-- Anon: read non-secret settings only. No function call.
CREATE POLICY storefront_anon_read_safe_settings
ON public.website_settings
FOR SELECT
TO anon
USING (
  key !~* '(secret|password|token|private|service[_-]?role|api[_-]?key)'
);

-- Authenticated: non-secrets for everyone, secrets for staff/admins.
CREATE POLICY storefront_auth_read_safe_settings
ON public.website_settings
FOR SELECT
TO authenticated
USING (
  key !~* '(secret|password|token|private|service[_-]?role|api[_-]?key)'
  OR public.is_admin_or_staff()
);

-- Staff/admins manage settings (website never upserts from the browser).
CREATE POLICY inventory_team_manage_settings
ON public.website_settings
FOR ALL
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

-- ── 3. Keep the linter-driven lockdown intact (document intent) ───────────────
-- Do NOT run GRANT EXECUTE ON is_admin_or_staff()/current_vendor_id() TO anon.
-- Anon policies above deliberately avoid those functions so the REVOKE from
-- fix_all_database_linter_issues.sql stays in force:
--   REVOKE ALL ON FUNCTION public.is_admin_or_staff() FROM PUBLIC, anon;
--   REVOKE ALL ON FUNCTION public.current_vendor_id() FROM PUBLIC, anon;
--   GRANT EXECUTE ... TO authenticated;
-- If a future migration re-adds `TO anon, authenticated USING (... OR
-- is_admin_or_staff())` on either table, this exact 401 will return.

-- =============================================================================
-- VERIFY (run separately after applying, as anon):
--   -- a) policies look right (2 SELECT per table split by role):
--   SELECT tablename, policyname, roles, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('website_products', 'website_settings')
--   ORDER BY tablename, policyname;
--   -- b) anon must have NO execute on the helpers (expect f/f):
--   SELECT has_function_privilege('anon', 'public.is_admin_or_staff()', 'execute'),
--          has_function_privilege('anon', 'public.current_vendor_id()', 'execute');
--   -- c) from a browser / curl with the anon key, both must return 200 + rows:
--   -- /rest/v1/website_products?select=id,title&is_active=eq.true&limit=1
--   -- /rest/v1/website_settings?select=key&limit=1
-- =============================================================================
