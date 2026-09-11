-- =============================================================================
-- LOCK DOWN website_settings (Phase 1 security hardening)
-- =============================================================================
-- Problem:
--   1. Older website_schema.sql created wide-open policies on website_settings:
--        "Public read settings"      (SELECT USING TRUE  -> leaks *_secret_key)
--        "Authenticated full access settings" (any authenticated JWT can write)
--      If that script was applied last, ANY visitor with the anon key can read
--      payment secrets and upsert() arbitrary store settings (phone hijack,
--      hero/slider defacement, flash-sale manipulation). The website client
--      even called .upsert() directly from the browser (since removed).
--   2. This script makes the lockdown idempotent: safe to run even if
--      harden_rls_policies.sql or restore_full_schema.sql was already applied.
--
-- Intended access after this script:
--   - anon + authenticated: SELECT only rows whose key does NOT look like a
--     secret (secret|password|token|private|service_role|api_key).
--   - authenticated staff/admins (public.is_admin_or_staff()): full access.
--   - Nobody else: no INSERT/UPDATE/DELETE, no secret-key reads.
--
-- HOW TO APPLY: paste this whole file into Supabase Dashboard -> SQL Editor
-- and run it. Then verify with the checks at the bottom of this file.
-- Also run remove_public_payment_secrets.sql once the payment-gateway Edge
-- Function holds the gateway secrets.
-- =============================================================================

-- 1. Ensure the staff-check helper exists (same definition as the other scripts)
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

GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;

-- 2. RLS must be on
ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;

-- 3. Drop every known broad/conflicting policy so exactly the two policies
--    below remain (covers website_schema.sql, harden_rls_policies.sql and
--    restore_full_schema.sql naming).
DROP POLICY IF EXISTS "Public read settings" ON public.website_settings;
DROP POLICY IF EXISTS "Authenticated full access settings" ON public.website_settings;
DROP POLICY IF EXISTS "Public read safe settings" ON public.website_settings;
DROP POLICY IF EXISTS "Admin staff manage settings" ON public.website_settings;
DROP POLICY IF EXISTS storefront_read_safe_settings ON public.website_settings;
DROP POLICY IF EXISTS inventory_team_only ON public.website_settings;

-- 4. Storefront: read non-secret settings only
CREATE POLICY storefront_read_safe_settings
ON public.website_settings
FOR SELECT
TO anon, authenticated
USING (
  key !~* '(secret|password|token|private|service[_-]?role|api[_-]?key)'
  OR public.is_admin_or_staff()
);

-- 5. Staff/admins (authenticated Supabase Auth users with a staff profile):
--    full access. The public website never holds such a session, so browser
--    upserts from the anon key now fail. Manage settings from the inventory
--    desktop/mobile apps instead.
CREATE POLICY inventory_team_manage_settings
ON public.website_settings
FOR ALL
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

-- =============================================================================
-- VERIFY (run separately, as the anon key role cannot be simulated here):
--
--   -- a) Only the two policies above should exist:
--   SELECT policyname, roles, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'website_settings';
--
--   -- b) No payment secrets readable by the storefront (expect 0 rows unless
--   --    you still need to run remove_public_payment_secrets.sql):
--   SELECT key FROM public.website_settings
--   WHERE key ~* '(secret|password|token|private|service[_-]?role|api[_-]?key)';
-- =============================================================================
