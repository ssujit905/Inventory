-- =============================================================================
-- FIX: "new row violates row-level security policy for table sales"
--      Vendor manual sale from desktop app (Sales form)
-- =============================================================================
-- Root cause: the vendor INSERT/SELECT policies on sales (and the matching
-- sale_items / transactions / product_lots policies) only exist in
-- fix_vendor_sales_rls.sql and vendor_staff_management.sql. If
-- harden_rls_policies.sql or restore_full_schema.sql was applied AFTER those
-- files, the vendor policies are gone and every vendor manual sale fails:
--   * harden drops ALL policies on sales and leaves only the admin/staff one
--     (is_admin_or_staff() is false for role = 'vendor'),
--   * restore's vendor policy is a USING-only FOR ALL policy whose check
--     needs sale_items rows that cannot exist yet at INSERT time.
--
-- This migration re-creates the complete vendor sales-flow policy set in one
-- place, team-aware (vendor owner + vendor staff via current_vendor_id()).
-- Idempotent and order-independent: safe to re-run any time. It does not
-- remove admin/staff access and does not grant anything to anon.
--
-- NOTE: sale_items policies must NEVER subquery sales, and sales SELECT
-- policies subquery sale_items — the reverse direction would recurse
-- ("infinite recursion detected in policy for relation sales"). Product-
-- ownership checks terminate because products policies only use
-- SECURITY DEFINER helpers (which bypass RLS).
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor as project owner.
-- =============================================================================

-- ── 0. Helper functions (same definitions as the earlier migrations) ──
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
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;

-- ── 1. sales: keep admin/staff full access ──────────────────────────
DROP POLICY IF EXISTS inventory_team_only ON public.sales;
CREATE POLICY inventory_team_only ON public.sales FOR ALL TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ── 2. sales: vendor owner (role='vendor') manual sales ─────────────
DROP POLICY IF EXISTS "Vendors insert own sales" ON public.sales;
CREATE POLICY "Vendors insert own sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'vendor'
    )
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS "Vendors read own sales" ON public.sales;
CREATE POLICY "Vendors read own sales" ON public.sales FOR SELECT TO authenticated
  USING (
    recorded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = auth.uid()
    )
  );

-- ── 3. sales: vendor team (owner + staff) manual sales ──────────────
DROP POLICY IF EXISTS vendor_team_insert_sales ON public.sales;
CREATE POLICY vendor_team_insert_sales ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    public.current_vendor_id() IS NOT NULL
    AND recorded_by = auth.uid()
  );

DROP POLICY IF EXISTS vendor_team_read_sales ON public.sales;
CREATE POLICY vendor_team_read_sales ON public.sales FOR SELECT TO authenticated
  USING (
    recorded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = public.current_vendor_id()
    )
  );

DROP POLICY IF EXISTS vendor_team_update_sales ON public.sales;
CREATE POLICY vendor_team_update_sales ON public.sales FOR UPDATE TO authenticated
  USING (
    recorded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = public.current_vendor_id()
    )
  )
  WITH CHECK (
    recorded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = public.current_vendor_id()
    )
  );

-- ── 4. sale_items: items of the vendor's own products (desktop form ──
--        sends sale_id + product_id + quantity, no vendor_id) ─────────
DROP POLICY IF EXISTS "Vendors insert own sale items" ON public.sale_items;
CREATE POLICY "Vendors insert own sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (
    vendor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.vendor_id = auth.uid()
    )
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

DROP POLICY IF EXISTS vendor_team_read_sale_items ON public.sale_items;
CREATE POLICY vendor_team_read_sale_items ON public.sale_items FOR SELECT TO authenticated
  USING (
    vendor_id = public.current_vendor_id()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

-- ── 5. transactions: stock movements for the vendor's own products ──
DROP POLICY IF EXISTS "Vendors insert own transactions" ON public.transactions;
CREATE POLICY "Vendors insert own transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = transactions.product_id AND p.vendor_id = auth.uid()
    )
    OR EXISTS (
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

DROP POLICY IF EXISTS vendor_team_read_transactions ON public.transactions;
CREATE POLICY vendor_team_read_transactions ON public.transactions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = transactions.product_id AND p.vendor_id = public.current_vendor_id()
    )
  );

-- ── 6. product_lots: stock deduction on the vendor's own lots ───────
DROP POLICY IF EXISTS "Vendors update own lots" ON public.product_lots;
CREATE POLICY "Vendors update own lots" ON public.product_lots FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS vendor_team_update_lots ON public.product_lots;
CREATE POLICY vendor_team_update_lots ON public.product_lots FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id())
  );

DROP POLICY IF EXISTS vendor_team_read_lots ON public.product_lots;
CREATE POLICY vendor_team_read_lots ON public.product_lots FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = public.current_vendor_id())
  );

-- =============================================================================
-- VERIFY (Supabase SQL Editor, after applying):
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('sales', 'sale_items', 'transactions', 'product_lots')
--   ORDER BY tablename, policyname;
--   -- expect vendor_team_insert_sales + "Vendors insert own sales" on sales.
-- =============================================================================
