-- =============================================================================
-- FIX: function gen_salt(unknown, integer) does not exist
-- =============================================================================
-- Root Cause:
--   The pgcrypto extension (which provides crypt() and gen_salt()) is installed
--   in Supabase's "extensions" schema. When functions like customer_register,
--   customer_setup_pin, customer_login, and customer_change_pin run with
--   search_path = public, Postgres cannot find gen_salt() in the search path.
--
-- Solution:
--   1. Ensure the pgcrypto extension is installed in the extensions schema.
--   2. Grant usage on the extensions schema to database roles.
--   3. Set search_path = public, extensions on all customer auth functions.
--
-- Run this in the Supabase Dashboard -> SQL Editor.
-- =============================================================================

-- 1. Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Grant permissions on schema extensions
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, postgres;

-- 3. Update search_path for all customer auth & PIN functions
DO $$
DECLARE
  fn TEXT;
  auth_crypto_fns TEXT[] := ARRAY[
    'customer_login(text,text)',
    'customer_register(text,text,text,text,text)',
    'customer_setup_pin(text,text,text,text,text)',
    'customer_change_pin(text,text,text)',
    'admin_reset_customer_pin(text,text)',
    'reset_customer_pin(text,text)',
    'verify_whatsapp_otp(text,text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY auth_crypto_fns LOOP
    IF to_regprocedure('public.' || fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public, extensions;', fn);
      RAISE NOTICE 'Updated search_path to (public, extensions) on: %', fn;
    END IF;
  END LOOP;

  -- Also dynamically find any function mentioning customer_setup_pin or customer_register
  FOR fn IN
    SELECT oid::regprocedure::text
    FROM pg_proc
    WHERE proname IN ('customer_login', 'customer_register', 'customer_setup_pin', 'customer_change_pin', 'admin_reset_customer_pin', 'reset_customer_pin', 'verify_whatsapp_otp')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions;', fn);
    RAISE NOTICE 'Secured function: %', fn;
  END LOOP;
END;
$$;

-- 4. Set database search_path default so ad-hoc SQL queries also resolve extensions
ALTER DATABASE postgres SET search_path TO public, extensions;

-- 5. Verification Test
SELECT extensions.crypt('1234', extensions.gen_salt('bf', 12)) AS test_hash;
