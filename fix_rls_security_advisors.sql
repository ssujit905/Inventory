-- =============================================================================
-- FIX: Supabase Security Advisor "rls_disabled_in_public"
-- =============================================================================
-- Description:
--   Supabase flagged CRITICAL ISSUE: "Table publicly accessible: Anyone with your
--   project URL can read, edit, and delete all data in this table because
--   Row-Level Security is not enabled." (rls_disabled_in_public)
--
-- This script:
--   1. Cleans up any experimental event triggers.
--   2. Explicitly enables Row-Level Security on all application tables.
--   3. Scans for any additional tables in 'public' and safely enables RLS.
--   4. Secures internal tables (website_otps, coin_transactions,
--      customer_auth_attempts, website_payment_intents, customer_sessions)
--      so anonymous/public users cannot read, edit, or delete them.
--   5. Verifies 0 public tables remain unprotected.
-- =============================================================================

-- ── 1. CLEAN UP ANY EVENT TRIGGER ────────────────────────────────────────────
DROP EVENT TRIGGER IF EXISTS trg_auto_enable_rls;
DROP FUNCTION IF EXISTS public.trg_auto_enable_rls();

-- ── 2. EXPLICITLY ENABLE RLS ON ALL APPLICATION TABLES ───────────────────────
ALTER TABLE IF EXISTS public.website_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customer_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_variant_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_delivery_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.website_product_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.product_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.income_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chatbot_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chatbot_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chatbot_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chatbot_shortcuts ENABLE ROW LEVEL SECURITY;

-- ── 3. CATCH-ALL: SAFELY ENABLE RLS ON ANY REMAINING PUBLIC TABLES ───────────
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = false
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
      RAISE NOTICE 'Enabled Row Level Security on public.%', r.tablename;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not enable RLS on public.%: %', r.tablename, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ── 4. SECURE SENSITIVE INTERNAL TABLES (PREVENT DIRECT ANON ACCESS) ─────────
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

-- website_otps
DO $$
BEGIN
  IF to_regclass('public.website_otps') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public access to website_otps" ON public.website_otps;
    DROP POLICY IF EXISTS "otps_admin_only" ON public.website_otps;
    EXECUTE 'CREATE POLICY "otps_admin_only" ON public.website_otps FOR ALL TO authenticated USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());';
  END IF;
END;
$$;

-- coin_transactions
DO $$
BEGIN
  IF to_regclass('public.coin_transactions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Public access to coin_transactions" ON public.coin_transactions;
    DROP POLICY IF EXISTS "coin_transactions_admin_only" ON public.coin_transactions;
    EXECUTE 'CREATE POLICY "coin_transactions_admin_only" ON public.coin_transactions FOR ALL TO authenticated USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());';
  END IF;
END;
$$;

-- customer_auth_attempts
DO $$
BEGIN
  IF to_regclass('public.customer_auth_attempts') IS NOT NULL THEN
    DROP POLICY IF EXISTS "customer_auth_attempts_admin_only" ON public.customer_auth_attempts;
    EXECUTE 'CREATE POLICY "customer_auth_attempts_admin_only" ON public.customer_auth_attempts FOR ALL TO authenticated USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());';
  END IF;
END;
$$;

-- website_payment_intents
DO $$
BEGIN
  IF to_regclass('public.website_payment_intents') IS NOT NULL THEN
    DROP POLICY IF EXISTS "payment_intents_admin_only" ON public.website_payment_intents;
    EXECUTE 'CREATE POLICY "payment_intents_admin_only" ON public.website_payment_intents FOR ALL TO authenticated USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());';
  END IF;
END;
$$;

-- customer_sessions
DO $$
BEGIN
  IF to_regclass('public.customer_sessions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "customer_sessions_admin_only" ON public.customer_sessions;
    EXECUTE 'CREATE POLICY "customer_sessions_admin_only" ON public.customer_sessions FOR ALL TO authenticated USING (public.is_admin_or_staff()) WITH CHECK (public.is_admin_or_staff());';
  END IF;
END;
$$;

-- ── 5. VERIFICATION QUERY ────────────────────────────────────────────────────
-- Check if any public tables remain with RLS disabled.
-- Result MUST return 0 rows.
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
