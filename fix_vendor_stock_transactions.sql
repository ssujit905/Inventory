-- =============================================================================
-- FIX: Vendor stock-in fails with RLS violation on transactions
-- =============================================================================
-- PROBLEM:
--   Desktop StockInPage (step 4/4) inserts a type='in' row into
--   public.transactions with the vendor's JWT. But transactions only has:
--     - "Admin and staff full access transactions" (ALL, admin/staff only)
--     - "Vendors view own transactions" (SELECT only)
--   so every vendor stock-in dies with:
--     "new row violates row-level security policy for table transactions"
--   (products/product_lots already allow vendor writes, which is why the
--   failure surfaces at step 4/4, not earlier).
--
-- FIX: vendor INSERT policy scoped to their own products, self-attributed,
-- inbound-only. Vendors still cannot fabricate 'sale'/'cancel' rows and
-- cannot touch other vendors' products.
--
-- ORDERING WARNING: harden_rls_policies.sql drops ALL policies on
-- transactions and recreates only the admin/staff one. If you run harden
-- AFTER this file, re-run this file afterwards. (Same staleness pattern as
-- the profiles_self_update revert — the small fix_*.sql files are
-- authoritative over the big consolidated scripts.)
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor. Idempotent.
-- =============================================================================

DROP POLICY IF EXISTS vendors_insert_own_transactions ON public.transactions;

CREATE POLICY vendors_insert_own_transactions
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  -- Row must be attributed to the signed-in user ...
  performed_by = auth.uid()
  -- ... inbound stock only (no fabricated sales/cancels) ...
  AND type = 'in'
  AND quantity_changed > 0
  -- ... on a product owned by the caller's vendor scope
  -- (vendor owners: own id; vendor staff: their vendor_id).
  AND EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = product_id
      AND p.vendor_id = public.current_vendor_id()
  )
);

-- =============================================================================
-- VERIFY (Supabase SQL Editor, after applying):
--   SELECT policyname, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'transactions';
--   -- expect vendors_insert_own_transactions (INSERT) alongside the
--   -- admin/staff + vendor-select policies. Then retry vendor stock-in in
--   -- the desktop app.
-- =============================================================================
