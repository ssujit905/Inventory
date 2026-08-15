-- =============================================================================
-- FIX: "new row violates row-level security policy for table sales"
--
-- Vendors create sales records from their portal (push website order to sales),
-- and the desktop/mobile sales forms write sales, sale_items, transactions and
-- update product_lots. The existing vendor RLS policies only allowed SELECT /
-- UPDATE on sales and SELECT on sale_items / transactions, so every vendor
-- insert was blocked. This migration adds the missing INSERT / UPDATE policies
-- for the vendor sales flow.
--
-- Run this in the Supabase SQL editor as the project owner.
-- =============================================================================

-- ---------------------------------------------------------------
-- 1. sales: vendors can INSERT sales they record themselves
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Vendors insert own sales" ON public.sales;
CREATE POLICY "Vendors insert own sales" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'vendor'
    )
    AND recorded_by = auth.uid()
  );

-- Re-assert admin/staff can always insert (in case an earlier script dropped
-- the admin policy on this table).
DROP POLICY IF EXISTS inventory_team_only ON public.sales;
CREATE POLICY inventory_team_only ON public.sales FOR ALL TO authenticated
  USING (public.is_admin_or_staff())
  WITH CHECK (public.is_admin_or_staff());

-- ---------------------------------------------------------------
-- 2. sales: vendors can READ their own sales (contains their products)
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Vendors read own sales" ON public.sales;
CREATE POLICY "Vendors read own sales" ON public.sales FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = auth.uid()
    )
    OR recorded_by = auth.uid()
  );

-- ---------------------------------------------------------------
-- 3. sales: vendors can UPDATE the status of their own sales
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Vendors update own sales" ON public.sales;
CREATE POLICY "Vendors update own sales" ON public.sales FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sale_items si
      JOIN public.products p ON p.id = si.product_id
      WHERE si.sale_id = sales.id AND p.vendor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------
-- 4. sale_items: vendors can INSERT items for their own products
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Vendors insert own sale items" ON public.sale_items;
CREATE POLICY "Vendors insert own sale items" ON public.sale_items FOR INSERT TO authenticated
  WITH CHECK (
    vendor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = sale_items.product_id AND p.vendor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Vendors read own sale items" ON public.sale_items;
CREATE POLICY "Vendors read own sale items" ON public.sale_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = sale_items.product_id AND p.vendor_id = auth.uid())
    OR vendor_id = auth.uid()
  );

-- ---------------------------------------------------------------
-- 5. transactions: vendors can INSERT transactions for their own products
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Vendors insert own transactions" ON public.transactions;
CREATE POLICY "Vendors insert own transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = transactions.product_id AND p.vendor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Vendors read own transactions" ON public.transactions;
CREATE POLICY "Vendors read own transactions" ON public.transactions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = transactions.product_id AND p.vendor_id = auth.uid())
  );

-- ---------------------------------------------------------------
-- 6. product_lots: vendors can UPDATE lots of their own products
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Vendors update own lots" ON public.product_lots;
CREATE POLICY "Vendors update own lots" ON public.product_lots FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = auth.uid())
  );

DROP POLICY IF EXISTS "Vendors read own lots" ON public.product_lots;
CREATE POLICY "Vendors read own lots" ON public.product_lots FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_lots.product_id AND p.vendor_id = auth.uid())
  );

-- ---------------------------------------------------------------
-- Verify after running:
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname='public' AND tablename IN ('sales','sale_items','transactions','product_lots')
-- ORDER BY tablename, policyname;
-- ---------------------------------------------------------------
