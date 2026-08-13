-- =============================================================================
-- FIX: Vendor RLS policies for website_variants, website_product_images and
--      website_variant_bundles (vendor product creation failed with 42501)
-- =============================================================================
-- PROBLEM:
--   fix_vendor_profile.sql added vendor policies to website_products only.
--   website_variants / website_product_images / website_variant_bundles only
--   had the admin/staff "inventory_team_only" policy from harden_rls_policies.sql,
--   so a vendor saving a product with variants hit:
--     new row violates row-level security policy for table "website_variants"
-- =============================================================================

-- 1. WEBSITE_VARIANTS — vendors can insert/update/delete variants of their own products
DROP POLICY IF EXISTS "Vendors insert own variants" ON public.website_variants;
CREATE POLICY "Vendors insert own variants" ON public.website_variants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS "Vendors update own variants" ON public.website_variants;
CREATE POLICY "Vendors update own variants" ON public.website_variants FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS "Vendors delete own variants" ON public.website_variants;
CREATE POLICY "Vendors delete own variants" ON public.website_variants FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  );

-- 2. WEBSITE_PRODUCT_IMAGES — vendors can insert/update/delete images of their own products
DROP POLICY IF EXISTS "Vendors insert own product images" ON public.website_product_images;
CREATE POLICY "Vendors insert own product images" ON public.website_product_images FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS "Vendors update own product images" ON public.website_product_images;
CREATE POLICY "Vendors update own product images" ON public.website_product_images FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS "Vendors delete own product images" ON public.website_product_images;
CREATE POLICY "Vendors delete own product images" ON public.website_product_images FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.website_products wp WHERE wp.id = product_id AND wp.vendor_id = auth.uid())
  );

-- 3. WEBSITE_VARIANT_BUNDLES — vendors can manage bundles whose variant belongs to them
DROP POLICY IF EXISTS "Vendors insert own variant bundles" ON public.website_variant_bundles;
CREATE POLICY "Vendors insert own variant bundles" ON public.website_variant_bundles FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Vendors update own variant bundles" ON public.website_variant_bundles;
CREATE POLICY "Vendors update own variant bundles" ON public.website_variant_bundles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Vendors delete own variant bundles" ON public.website_variant_bundles;
CREATE POLICY "Vendors delete own variant bundles" ON public.website_variant_bundles FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = auth.uid()
    )
  );

-- 4. WEBSITE_PRODUCTS — add the missing DELETE policy for vendors (fix_vendor_profile.sql
--    only created SELECT/INSERT/UPDATE for vendors)
DROP POLICY IF EXISTS "Vendors delete own website products" ON public.website_products;
CREATE POLICY "Vendors delete own website products" ON public.website_products FOR DELETE TO authenticated
  USING (
    (vendor_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor'))
    OR vendor_id IS NULL
    OR public.is_admin_or_staff()
  );

-- Verification:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('website_variants', 'website_product_images', 'website_variant_bundles', 'website_products')
-- ORDER BY tablename, cmd, policyname;
