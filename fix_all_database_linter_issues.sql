-- =============================================================================
-- MASTER FIX: ALL SUPABASE DATABASE LINTER WARNINGS & ADVISORS
-- =============================================================================
-- Covers:
--   1. function_search_path_mutable (create_atomic_website_order, sync_website_order_status, confirm_website_payment)
--   2. rls_policy_always_true (public.chatbot_notifications)
--   3. public_bucket_allows_listing (expense-receipts, product-images, return-images, store-logos, website-images)
--   4. anon_security_definer_function_executable & authenticated_security_definer_function_executable
--      (Revoke execution on trigger functions, internal helpers, and admin-only routines)
--   5. Ensure search_path = public on all remaining public-facing RPCs
-- =============================================================================

-- ── 1. FIX SEARCH_PATH MUTABLE ON FUNCTIONS ──────────────────────────────────
-- Secures functions against search_path hijacking attacks

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Fix all overloads of create_atomic_website_order
  FOR r IN
    SELECT oid::regprocedure AS func
    FROM pg_proc
    WHERE proname = 'create_atomic_website_order'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public;', r.func);
  END LOOP;

  -- Fix sync_website_order_status
  FOR r IN
    SELECT oid::regprocedure AS func
    FROM pg_proc
    WHERE proname = 'sync_website_order_status'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public;', r.func);
  END LOOP;

  -- Fix confirm_website_payment
  FOR r IN
    SELECT oid::regprocedure AS func
    FROM pg_proc
    WHERE proname = 'confirm_website_payment'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public;', r.func);
  END LOOP;
END;
$$;


-- ── 2. FIX RLS POLICY ALWAYS TRUE (chatbot_notifications) ────────────────────
-- Replace unrestricted WITH CHECK (true) with validation on required notification data
DO $$
BEGIN
  IF to_regclass('public.chatbot_notifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Chatbot insert notifications" ON public.chatbot_notifications;
    DROP POLICY IF EXISTS "Allow chatbot to insert notifications" ON public.chatbot_notifications;

    CREATE POLICY "Chatbot insert notifications" ON public.chatbot_notifications
      FOR INSERT TO anon, authenticated
      WITH CHECK (
        customer_name IS NOT NULL
        AND length(trim(customer_name)) > 0
        AND last_message IS NOT NULL
      );
  END IF;
END;
$$;


-- ── 3. FIX STORAGE BUCKETS ALLOWING LISTING (storage.objects) ────────────────
-- Drop broad SELECT policies that allowed anyone to enumerate all files in storage.
-- Public buckets continue serving image files directly via their public URLs without RLS.
DROP POLICY IF EXISTS "Public Access to Expense Receipts" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to Product Images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to Return Images" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to Store Logos" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;

-- Ensure authenticated admin/staff can still list and manage files across storage
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Team Manage All Storage" ON storage.objects;
    CREATE POLICY "Team Manage All Storage" ON storage.objects
      FOR ALL TO authenticated
      USING (public.is_admin_or_staff())
      WITH CHECK (public.is_admin_or_staff());
  END IF;
END;
$$;


-- ── 4. REVOKE EXECUTE ON TRIGGER & INTERNAL FUNCTIONS ────────────────────────
-- Trigger functions must never be directly callable as API RPC endpoints.
DO $$
DECLARE
  fn TEXT;
  trigger_fns TEXT[] := ARRAY[
    'auto_fill_order_item_vendor()',
    'clawback_rating_coins_on_order_close()',
    'credit_coins_on_return_rejected()',
    'handle_new_user()',
    'resolve_return_vendor()',
    'sync_website_order_status()'
  ];
BEGIN
  FOREACH fn IN ARRAY trigger_fns LOOP
    IF to_regprocedure('public.' || fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', fn);
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public;', fn);
    END IF;
  END LOOP;
END;
$$;

-- Internal helper functions: never exposed to anonymous visitors
DO $$
DECLARE
  fn TEXT;
  internal_fns TEXT[] := ARRAY[
    'private_create_customer_session(text)',
    'private_customer_from_session(text)',
    'confirm_website_payment(text,text,text)',
    'confirm_website_payment(text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    IF to_regprocedure('public.' || fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated;', fn);
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public;', fn);
    END IF;
  END LOOP;
END;
$$;

-- Admin-only & staff-only functions: revoked from anon, allowed only for authenticated
DO $$
DECLARE
  fn TEXT;
  staff_fns TEXT[] := ARRAY[
    'admin_reset_customer_pin(text,text)',
    'create_vendor_staff_profile(uuid,text,text,text,uuid)',
    'current_vendor_id()',
    'is_vendor_member(uuid)',
    'is_admin_or_staff()'
  ];
BEGIN
  FOREACH fn IN ARRAY staff_fns LOOP
    IF to_regprocedure('public.' || fn) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon;', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated;', fn);
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public;', fn);
    END IF;
  END LOOP;
END;
$$;


-- ── 5. HARDEN REMAINING STOREFRONT RPCs WITH SEARCH_PATH = PUBLIC ────────────
-- These functions are intentionally callable by visitors/customers for e-commerce.
-- Setting search_path = public protects them against search path hijacking.
DO $$
DECLARE
  fn TEXT;
  storefront_fns TEXT[] := ARRAY[
    'customer_login(text,text)',
    'customer_register(text,text,text,text,text)',
    'customer_setup_pin(text,text,text,text,text)',
    'customer_session_profile(text)',
    'customer_change_pin(text,text,text)',
    'customer_orders(text)',
    'customer_returns(text)',
    'customer_request_return(text,bigint,text,text,jsonb)',
    'customer_submit_rating(text,bigint,bigint,integer,text)',
    'customer_update_profile(text,text,text,text)',
    'handle_website_order_cancellation(bigint,text,text)',
    'submit_contact_message(text,text,text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY storefront_fns LOOP
    IF to_regprocedure('public.' || fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public;', fn);
    END IF;
  END LOOP;

  -- Ensure create_payment_intent overloads also have search_path = public
  FOR fn IN
    SELECT oid::regprocedure::text
    FROM pg_proc
    WHERE proname = 'create_payment_intent'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public;', fn);
  END LOOP;
END;
$$;


-- ── 6. VERIFICATION ──────────────────────────────────────────────────────────
-- A. Verify mutable search_path is gone
SELECT
  proname AS function_name,
  proconfig AS search_path_setting
FROM pg_proc
WHERE proname IN (
  'create_atomic_website_order',
  'sync_website_order_status',
  'confirm_website_payment',
  'admin_reset_customer_pin',
  'customer_login'
);

-- B. Verify broad storage policies were dropped
SELECT policyname, tablename
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname LIKE 'Public Access%';
