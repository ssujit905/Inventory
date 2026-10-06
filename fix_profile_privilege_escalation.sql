-- =============================================================================
-- FIX: Prevent Self-Signup Privilege Escalation on public.profiles
-- =============================================================================
-- Problem:
--   The previous profiles_self_create_staff policy evaluated:
--     (id = auth.uid() AND role IN ('staff', 'vendor') AND vendor_id IS NOT DISTINCT FROM public.current_vendor_id())
--   When a new user signs up via Supabase Auth, they do not yet have a row in
--   public.profiles, so public.current_vendor_id() returned NULL.
--   An attacker signing up via the public anon key could insert a profile with
--   role = 'staff' and vendor_id = NULL. Because NULL IS NOT DISTINCT FROM NULL,
--   the check passed. The attacker then gained is_admin_or_staff() access across
--   all orders, sales, customer data, and inventory.
--
-- Fix:
--   1. Self-signups can only create a 'vendor' profile with vendor_id = NULL.
--   2. 'staff' profiles can only be created by:
--        a) System admins or existing staff (via public.is_admin_or_staff())
--        b) Vendor owners creating staff for their own store (vendor_id = auth.uid())
--   3. Apply the same check to profiles_self_update so users cannot elevate their
--      role to staff or admin after signup.
-- =============================================================================

DROP POLICY IF EXISTS profiles_self_create_staff ON public.profiles;
CREATE POLICY profiles_self_create_staff ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    -- Self-signup can only create a vendor profile
    (id = auth.uid() AND role = 'vendor' AND vendor_id IS NULL)
    -- System admin / staff can create profiles
    OR public.is_admin_or_staff()
    -- Vendor owner can create staff under their vendor account
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
    OR vendor_id = auth.uid()
  )
  WITH CHECK (
    -- Users can update their own vendor profile (without self-assigning staff/admin)
    (id = auth.uid() AND role = 'vendor' AND vendor_id IS NULL)
    -- System admin / staff can update profiles
    OR public.is_admin_or_staff()
    -- Vendor owner can update staff under their vendor account
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- =============================================================================
-- Verification query (run after applying):
-- =============================================================================
-- SELECT policyname, cmd, qual, with_check 
-- FROM pg_policies 
-- WHERE tablename = 'profiles' AND policyname IN ('profiles_self_create_staff', 'profiles_self_update');
