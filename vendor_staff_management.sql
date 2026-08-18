-- =============================================================================
-- VENDOR STAFF MANAGEMENT
--
-- Lets a vendor create staff accounts that belong to them. Those staff sign
-- into the vendor portal (and the main desktop/mobile apps) and see ONLY that
-- vendor's data, with the same read_only / read_write permission system that
-- main-store staff have.
--
-- Changes:
--   1. profiles.vendor_id column (NULL = main-store user / vendor owner)
--   2. Helper functions current_vendor_id() / is_vendor_member()
--   3. Profiles RLS: vendors manage their own staff; staff read their vendor
--   4. expenses.vendor_id so vendor teams scope their own ads/expenses
--   5. Vendor-team access policies on every vendor-scoped data table
--
-- Run this in the Supabase SQL editor as the project owner.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. SCHEMA
-- ---------------------------------------------------------------------------

-- Vendors' staff rows point at their vendor's profile row (profiles.id).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Scope vendor ads / expenses to the owning vendor account.
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Backfill existing vendor-recorded expenses (ads and other) with their vendor.
UPDATE public.expenses e
SET vendor_id = e.recorded_by
WHERE e.vendor_id IS NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = e.recorded_by AND p.role = 'vendor');

-- ---------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS
-- ---------------------------------------------------------------------------

-- Returns the vendor account id the current user belongs to:
--   * role = 'vendor'                 -> their own id
--   * role = 'staff' with vendor_id   -> that vendor's id
--   * main-store admin / staff        -> NULL (never matches vendor data)
CREATE OR REPLACE FUNCTION public.current_vendor_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.role = 'vendor' THEN p.id
    WHEN p.role = 'staff' AND p.vendor_id IS NOT NULL THEN p.vendor_id
    ELSE NULL
  END
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_vendor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_vendor_id() TO anon, authenticated;

-- True when owner_id is the caller's vendor account (or the caller themselves).
CREATE OR REPLACE FUNCTION public.is_vendor_member(owner_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT owner_id = public.current_vendor_id();
$$;

REVOKE ALL ON FUNCTION public.is_vendor_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_vendor_member(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. PROFILES RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Read: own profile, admin/staff, vendors read their staff, staff read vendor
DROP POLICY IF EXISTS profiles_self_read ON public.profiles;
CREATE POLICY profiles_self_read ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
    OR vendor_id = auth.uid()
    OR (role = 'vendor' AND id = public.current_vendor_id())
  );

-- Insert: own signup (no self-assigned vendor), admin/staff, or vendor creates staff
DROP POLICY IF EXISTS profiles_self_create_staff ON public.profiles;
CREATE POLICY profiles_self_create_staff ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    (id = auth.uid() AND role IN ('staff', 'vendor') AND vendor_id IS NOT DISTINCT FROM public.current_vendor_id())
    OR public.is_admin_or_staff()
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- Update: own profile (cannot re-assign vendor_id), admin/staff, or vendor edits staff
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin_or_staff()
    OR vendor_id = auth.uid()
  )
  WITH CHECK (
    (id = auth.uid() AND role IN ('staff', 'vendor') AND vendor_id IS NOT DISTINCT FROM public.current_vendor_id())
    OR public.is_admin_or_staff()
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- Delete: admin/staff, or vendor deletes their own staff
DROP POLICY IF EXISTS profiles_admin_delete ON public.profiles;
CREATE POLICY profiles_admin_delete ON public.profiles FOR DELETE TO authenticated
  USING (
    public.is_admin_or_staff()
    OR (
      role = 'staff'
      AND vendor_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor')
    )
  );

-- ---------------------------------------------------------------------------
-- 4. PRODUCTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_products ON public.products;
CREATE POLICY vendor_team_read_products ON public.products FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_insert_products ON public.products;
CREATE POLICY vendor_team_insert_products ON public.products FOR INSERT TO authenticated
  WITH CHECK (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_update_products ON public.products;
CREATE POLICY vendor_team_update_products ON public.products FOR UPDATE TO authenticated
  USING (vendor_id = public.current_vendor_id())
  WITH CHECK (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_delete_products ON public.products;
CREATE POLICY vendor_team_delete_products ON public.products FOR DELETE TO authenticated
  USING (vendor_id = public.current_vendor_id());

-- ---------------------------------------------------------------------------
-- 5. PRODUCT_LOTS (vendor owns lots of their products)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_lots ON public.product_lots;
CREATE POLICY vendor_team_read_lots ON public.product_lots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_insert_lots ON public.product_lots;
CREATE POLICY vendor_team_insert_lots ON public.product_lots FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_update_lots ON public.product_lots;
CREATE POLICY vendor_team_update_lots ON public.product_lots FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_delete_lots ON public.product_lots;
CREATE POLICY vendor_team_delete_lots ON public.product_lots FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. TRANSACTIONS (vendor records stock/sale movements on their products)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_transactions ON public.transactions;
CREATE POLICY vendor_team_read_transactions ON public.transactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = transactions.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_insert_transactions ON public.transactions;
CREATE POLICY vendor_team_insert_transactions ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = transactions.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. SALE_ITEMS (vendor team reads/creates items of their products)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_sale_items ON public.sale_items;
CREATE POLICY vendor_team_read_sale_items ON public.sale_items FOR SELECT TO authenticated
  USING (
    vendor_id = public.current_vendor_id()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_insert_sale_items ON public.sale_items;
CREATE POLICY vendor_team_insert_sale_items ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (
    vendor_id = public.current_vendor_id()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_update_sale_items ON public.sale_items;
CREATE POLICY vendor_team_update_sale_items ON public.sale_items FOR UPDATE TO authenticated
  USING (
    vendor_id = public.current_vendor_id()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.vendor_id = public.current_vendor_id()
    )
  )
  WITH CHECK (
    vendor_id = public.current_vendor_id()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 8. SALES (vendor team reads/updates sales containing their products; any
--           vendor-team member may create a sale they recorded)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_sales ON public.sales;
CREATE POLICY vendor_team_read_sales ON public.sales FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = public.current_vendor_id()
    )
    OR recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS vendor_team_insert_sales ON public.sales;
CREATE POLICY vendor_team_insert_sales ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    public.current_vendor_id() IS NOT NULL
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS vendor_team_update_sales ON public.sales;
CREATE POLICY vendor_team_update_sales ON public.sales FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = public.current_vendor_id()
    )
    OR recorded_by = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = public.current_vendor_id()
    )
    OR recorded_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 9. WEBSITE_PRODUCTS (vendor team manages their own listings)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_website_products ON public.website_products;
CREATE POLICY vendor_team_read_website_products ON public.website_products FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_insert_website_products ON public.website_products;
CREATE POLICY vendor_team_insert_website_products ON public.website_products FOR INSERT TO authenticated
  WITH CHECK (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_update_website_products ON public.website_products;
CREATE POLICY vendor_team_update_website_products ON public.website_products FOR UPDATE TO authenticated
  USING (vendor_id = public.current_vendor_id())
  WITH CHECK (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_delete_website_products ON public.website_products;
CREATE POLICY vendor_team_delete_website_products ON public.website_products FOR DELETE TO authenticated
  USING (vendor_id = public.current_vendor_id());

-- ---------------------------------------------------------------------------
-- 10. WEBSITE_VARIANTS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_variants ON public.website_variants;
CREATE POLICY vendor_team_read_variants ON public.website_variants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_insert_variants ON public.website_variants;
CREATE POLICY vendor_team_insert_variants ON public.website_variants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_update_variants ON public.website_variants;
CREATE POLICY vendor_team_update_variants ON public.website_variants FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_delete_variants ON public.website_variants;
CREATE POLICY vendor_team_delete_variants ON public.website_variants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 11. WEBSITE_PRODUCT_IMAGES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_product_images ON public.website_product_images;
CREATE POLICY vendor_team_read_product_images ON public.website_product_images FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_insert_product_images ON public.website_product_images;
CREATE POLICY vendor_team_insert_product_images ON public.website_product_images FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_update_product_images ON public.website_product_images;
CREATE POLICY vendor_team_update_product_images ON public.website_product_images FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_delete_product_images ON public.website_product_images;
CREATE POLICY vendor_team_delete_product_images ON public.website_product_images FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_products wp
      WHERE wp.id = product_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 12. WEBSITE_VARIANT_BUNDLES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_variant_bundles ON public.website_variant_bundles;
CREATE POLICY vendor_team_read_variant_bundles ON public.website_variant_bundles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_insert_variant_bundles ON public.website_variant_bundles;
CREATE POLICY vendor_team_insert_variant_bundles ON public.website_variant_bundles FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_update_variant_bundles ON public.website_variant_bundles;
CREATE POLICY vendor_team_update_variant_bundles ON public.website_variant_bundles FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = public.current_vendor_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_delete_variant_bundles ON public.website_variant_bundles;
CREATE POLICY vendor_team_delete_variant_bundles ON public.website_variant_bundles FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.website_variants v
      JOIN public.website_products wp ON wp.id = v.product_id
      WHERE v.id = bundle_variant_id AND wp.vendor_id = public.current_vendor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 13. WEBSITE_ORDERS (vendor team reads/updates orders containing their items)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_orders ON public.website_orders;
CREATE POLICY vendor_team_read_orders ON public.website_orders FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_order_items woi
      WHERE woi.order_id = website_orders.id AND woi.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_update_orders ON public.website_orders;
CREATE POLICY vendor_team_update_orders ON public.website_orders FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.website_order_items woi
      WHERE woi.order_id = website_orders.id AND woi.vendor_id = public.current_vendor_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.website_order_items woi
      WHERE woi.order_id = website_orders.id AND woi.vendor_id = public.current_vendor_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 14. WEBSITE_ORDER_ITEMS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_order_items ON public.website_order_items;
CREATE POLICY vendor_team_read_order_items ON public.website_order_items FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_update_order_items ON public.website_order_items;
CREATE POLICY vendor_team_update_order_items ON public.website_order_items FOR UPDATE TO authenticated
  USING (vendor_id = public.current_vendor_id())
  WITH CHECK (vendor_id = public.current_vendor_id());

-- ---------------------------------------------------------------------------
-- 15. WEBSITE_ORDER_RETURNS
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_returns ON public.website_order_returns;
CREATE POLICY vendor_team_read_returns ON public.website_order_returns FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_update_returns ON public.website_order_returns;
CREATE POLICY vendor_team_update_returns ON public.website_order_returns FOR UPDATE TO authenticated
  USING (vendor_id = public.current_vendor_id())
  WITH CHECK (vendor_id = public.current_vendor_id());

-- ---------------------------------------------------------------------------
-- 16. WEBSITE_DELIVERY_BRANCHES
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_branches ON public.website_delivery_branches;
CREATE POLICY vendor_team_read_branches ON public.website_delivery_branches FOR SELECT TO authenticated
  USING (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_insert_branches ON public.website_delivery_branches;
CREATE POLICY vendor_team_insert_branches ON public.website_delivery_branches FOR INSERT TO authenticated
  WITH CHECK (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_update_branches ON public.website_delivery_branches;
CREATE POLICY vendor_team_update_branches ON public.website_delivery_branches FOR UPDATE TO authenticated
  USING (vendor_id = public.current_vendor_id())
  WITH CHECK (vendor_id = public.current_vendor_id());

DROP POLICY IF EXISTS vendor_team_delete_branches ON public.website_delivery_branches;
CREATE POLICY vendor_team_delete_branches ON public.website_delivery_branches FOR DELETE TO authenticated
  USING (vendor_id = public.current_vendor_id());

-- ---------------------------------------------------------------------------
-- 17. EXPENSES / ADS (vendor team reads its own records; members may record)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS vendor_team_read_expenses ON public.expenses;
CREATE POLICY vendor_team_read_expenses ON public.expenses FOR SELECT TO authenticated
  USING (
    public.current_vendor_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = expenses.recorded_by
        AND (p.id = public.current_vendor_id() OR p.vendor_id = public.current_vendor_id())
    )
  );

DROP POLICY IF EXISTS vendor_team_insert_expenses ON public.expenses;
CREATE POLICY vendor_team_insert_expenses ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (
    public.current_vendor_id() IS NOT NULL
    AND auth.uid() = recorded_by
    AND vendor_id = public.current_vendor_id()
  );

DROP POLICY IF EXISTS vendor_team_update_expenses ON public.expenses;
CREATE POLICY vendor_team_update_expenses ON public.expenses FOR UPDATE TO authenticated
  USING (
    public.current_vendor_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = expenses.recorded_by
        AND (p.id = public.current_vendor_id() OR p.vendor_id = public.current_vendor_id())
    )
  )
  WITH CHECK (
    public.current_vendor_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = expenses.recorded_by
        AND (p.id = public.current_vendor_id() OR p.vendor_id = public.current_vendor_id())
    )
  );

DROP POLICY IF EXISTS vendor_team_delete_expenses ON public.expenses;
CREATE POLICY vendor_team_delete_expenses ON public.expenses FOR DELETE TO authenticated
  USING (
    public.current_vendor_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = expenses.recorded_by
        AND (p.id = public.current_vendor_id() OR p.vendor_id = public.current_vendor_id())
    )
  );

-- ---------------------------------------------------------------------------
-- 19. CREATE VENDOR STAFF PROFILE (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- auth.signUp() fires handle_new_user() which pre-inserts a profiles row
-- WITHOUT vendor_id. A subsequent upsert becomes an UPDATE that vendor RLS
-- blocks (the row's vendor_id is NULL). This definer function bypasses RLS so
-- the vendor owner can correctly link the new staff row to their store.
CREATE OR REPLACE FUNCTION public.create_vendor_staff_profile(
    p_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_permissions TEXT,
    p_vendor_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    is_owner BOOLEAN;
BEGIN
    IF p_permissions NOT IN ('read_only', 'read_write') THEN
        RAISE EXCEPTION 'Invalid permissions level.';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'vendor'
    ) INTO is_owner;

    IF NOT is_owner THEN
        RAISE EXCEPTION 'Only a vendor owner can create staff.';
    END IF;

    IF p_vendor_id IS DISTINCT FROM auth.uid() THEN
        RAISE EXCEPTION 'Staff must be linked to your own store.';
    END IF;

    INSERT INTO public.profiles (id, full_name, email, role, permissions, vendor_id, created_at)
    VALUES (p_user_id, p_full_name, p_email, 'staff', p_permissions, p_vendor_id, now())
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = 'staff',
        permissions = EXCLUDED.permissions,
        vendor_id = EXCLUDED.vendor_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_vendor_staff_profile(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_vendor_staff_profile(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Verify after running:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND policyname LIKE 'vendor_team_%'
-- ORDER BY tablename, cmd;
-- ---------------------------------------------------------------------------
