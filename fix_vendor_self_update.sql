-- =============================================================================
-- FIX: Vendor owners cannot save their own profile (RLS violation)
-- =============================================================================
-- PROBLEM:
--   profiles_self_update (from vendor_staff_management.sql) has:
--     WITH CHECK (
--       (id = auth.uid() AND role IN ('staff','vendor')
--        AND vendor_id IS NOT DISTINCT FROM public.current_vendor_id()) ...
--     )
--   For a vendor OWNER (role='vendor', vendor_id = NULL) current_vendor_id()
--   returns their OWN id, so `NULL IS NOT DISTINCT FROM <own-id>` is FALSE
--   and the vendor can never update their own profile:
--   "new row violates row-level security policy for table profiles"
-- =============================================================================

DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
    OR vendor_id = auth.uid()
  )
  WITH CHECK (
    (id = auth.uid() AND role IN ('staff', 'vendor') AND vendor_id IS NOT DISTINCT FROM public.current_vendor_id())
    OR (id = auth.uid() AND role = 'vendor' AND vendor_id IS NULL)
    OR public.is_admin_or_staff()
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- Verification:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'profiles';