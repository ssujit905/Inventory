-- =============================================================================
-- FIX: function gen_random_bytes(integer) does not exist
-- =============================================================================
-- Root Cause:
--   gen_random_bytes(), digest(), crypt(), gen_salt() all come from the
--   pgcrypto extension. On Supabase pgcrypto lives in the "extensions"
--   schema, NOT in "public". The token/session functions call them
--   unqualified (gen_random_bytes(32)) and rely on
--   `SET search_path = public, extensions` to resolve them.
--
--   The error means pgcrypto was not visible at call time. Any one of:
--     1. pgcrypto was never enabled on this database
--        (fix_payment_intents.sql never ran CREATE EXTENSION at all, and
--        fix_server_side_pricing.sql — its documented prerequisite — does
--        not create it either).
--     2. pgcrypto is installed but in the wrong schema (public vs
--        extensions) after bare `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
--        without WITH SCHEMA.
--     3. A hardening/linter script reset a function's search_path back to
--        just `public`, dropping `extensions` again.
--
-- Solution (this file, idempotent — run whole file in SQL Editor):
--   1. Ensure pgcrypto exists AND lives in the extensions schema
--      (ALTER EXTENSION ... SET SCHEMA relocates it if an older script
--      installed it into public).
--   2. Grant USAGE on the extensions schema.
--   3. Recreate the token functions with schema-qualified calls
--      (extensions.gen_random_bytes / extensions.digest), so they work
--      even if search_path is later reset to just `public`.
--   4. Re-apply SET search_path = public, extensions on every function
--      that uses pgcrypto (belt and suspenders: qualified calls + path).
--
-- Run this in the Supabase Dashboard -> SQL Editor.
-- =============================================================================

-- 1. Ensure pgcrypto exists, in the extensions schema -----------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- If an older script installed pgcrypto into public, move it to extensions
-- so extensions.gen_random_bytes() below always resolves.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) AND (
    SELECT n.nspname FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto'
  ) <> 'extensions' THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
    RAISE NOTICE 'Moved pgcrypto extension to extensions schema';
  END IF;
END;
$$;

-- 2. Grant USAGE so anon/authenticated-called SECURITY DEFINER fns resolve it
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role, postgres;

-- 3a. Session-token helper — schema-qualified, immune to search_path wipes --
CREATE OR REPLACE FUNCTION public.private_customer_from_session(p_token TEXT)
RETURNS public.website_customers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_customer public.website_customers;
BEGIN
  SELECT c.* INTO v_customer
  FROM public.customer_sessions s JOIN public.website_customers c ON c.phone = s.customer_phone
  WHERE s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') AND s.expires_at > now();
  RETURN v_customer;
END;
$$;

CREATE OR REPLACE FUNCTION public.private_create_customer_session(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_token TEXT := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM public.customer_sessions WHERE customer_phone = p_phone OR expires_at <= now();
  INSERT INTO public.customer_sessions(customer_phone, token_hash, expires_at)
  VALUES (p_phone, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days');
  RETURN v_token;
END;
$$;

-- Backwards-compat alias: secure_customer_sessions.sql created an unqualified
-- private_create_customer_session(text) in older DBs; keep it working too.
CREATE OR REPLACE FUNCTION private_create_customer_session(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_token TEXT := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM public.customer_sessions WHERE customer_phone = p_phone OR expires_at <= now();
  INSERT INTO public.customer_sessions(customer_phone, token_hash, expires_at)
  VALUES (p_phone, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '7 days');
  RETURN v_token;
END;
$$;

-- 3b. Payment-intent token — same treatment --------------------------------
-- NOTE: full body of fix_payment_intents.sql is NOT repeated here; only the
-- token-generation lines are hardened. If create_payment_intent does not
-- exist yet, run fix_server_side_pricing.sql + fix_payment_intents.sql first,
-- then re-run this file.
DO $$
BEGIN
  IF to_regprocedure('public.create_payment_intent(text,text,text,text,text,text,jsonb,numeric,uuid)') IS NOT NULL THEN
    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.create_payment_intent(
        p_customer_name TEXT,
        p_phone TEXT,
        p_phone2 TEXT,
        p_address TEXT,
        p_city TEXT,
        p_payment_method TEXT,
        p_items JSONB,
        p_coins_used NUMERIC DEFAULT 0,
        p_ad_id UUID DEFAULT NULL
    )
    RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $body$
    DECLARE
        v_quote      JSONB;
        v_coins_used NUMERIC;
        v_total      NUMERIC;
        v_token      TEXT := encode(extensions.gen_random_bytes(32), 'hex');
        v_gateway    TEXT;
        v_slim_items JSONB;
        v_intent_id  UUID;
        v_expires    TIMESTAMPTZ;
    BEGIN
        IF p_payment_method = 'eSewa' THEN
            v_gateway := 'esewa';
        ELSIF p_payment_method = 'Bank Transfer' THEN
            v_gateway := 'fonepay';
        ELSE
            RAISE EXCEPTION 'INVALID_PAYMENT_METHOD_FOR_INTENT';
        END IF;

        IF p_phone IS NULL OR p_phone !~ '^[0-9]{10}$' THEN
            RAISE EXCEPTION 'INVALID_PHONE: phone must be exactly 10 digits';
        END IF;
        IF p_customer_name IS NULL OR trim(p_customer_name) = '' THEN
            RAISE EXCEPTION 'INVALID_NAME';
        END IF;
        IF p_address IS NULL OR trim(p_address) = '' THEN
            RAISE EXCEPTION 'INVALID_ADDRESS';
        END IF;

        v_quote := public.private_compute_order_pricing(
            p_items, p_city, p_phone, p_payment_method);

        v_coins_used := LEAST(COALESCE(p_coins_used, 0),
                              (v_quote->>'coins_allowed')::numeric);
        IF v_coins_used < 0 THEN
            v_coins_used := 0;
        END IF;
        v_total := (v_quote->>'subtotal')::numeric
                 + (v_quote->>'shipping_fee')::numeric
                 - v_coins_used;

        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'variant_id', x.val->>'variant_id',
                'quantity', (x.val->>'quantity')::int
            )
        ), '[]'::jsonb)
        INTO v_slim_items
        FROM jsonb_array_elements(p_items) AS x(val);

        v_expires := now() + interval '45 minutes';
        INSERT INTO public.website_payment_intents (
            token_hash, gateway, customer_name, phone, phone2, address, city,
            items, coins_used, ad_id, subtotal, shipping_fee, expected_total,
            expires_at
        ) VALUES (
            encode(extensions.digest(v_token, 'sha256'), 'hex'), v_gateway,
            trim(p_customer_name), p_phone, COALESCE(p_phone2, ''),
            trim(p_address), p_city, v_slim_items, v_coins_used, p_ad_id,
            (v_quote->>'subtotal')::numeric, (v_quote->>'shipping_fee')::numeric,
            v_total, v_expires
        ) RETURNING id INTO v_intent_id;

        DELETE FROM public.website_payment_intents
        WHERE status IN ('expired', 'failed', 'cancelled')
          AND created_at < now() - interval '1 day';
        UPDATE public.website_payment_intents SET status = 'expired'
        WHERE status = 'pending' AND expires_at <= now();

        RETURN jsonb_build_object(
            'intent_token', v_token,
            'gateway', v_gateway,
            'subtotal', (v_quote->>'subtotal')::numeric,
            'shipping_fee', (v_quote->>'shipping_fee')::numeric,
            'coins_used', v_coins_used,
            'total_amount', v_total,
            'expires_at', v_expires
        );
    END;
    $body$;
    $fn$;
    RAISE NOTICE 'Hardened public.create_payment_intent with extensions-qualified token calls';
  ELSE
    RAISE NOTICE 'create_payment_intent not found — run fix_server_side_pricing.sql + fix_payment_intents.sql first, then re-run this file';
  END IF;
END;
$$;

-- 4. Belt and suspenders: re-apply search_path on every pgcrypto user --------
DO $$
DECLARE
  fn TEXT;
  crypto_fns TEXT[] := ARRAY[
    'customer_login(text,text)',
    'customer_register(text,text,text,text,text)',
    'customer_setup_pin(text,text,text,text,text)',
    'customer_change_pin(text,text,text)',
    'admin_reset_customer_pin(text,text)',
    'reset_customer_pin(text,text,numeric,text)',
    'reset_customer_pin(text,text)',
    'verify_whatsapp_otp(text,text,text)',
    'private_create_customer_session(text)',
    'private_customer_from_session(text)',
    'customer_session_profile(text)',
    'customer_update_profile(text,text,text,text)',
    'customer_orders(text)',
    'customer_returns(text)',
    'customer_submit_rating(text,bigint,bigint,integer,text)',
    'create_payment_intent(text,text,text,text,text,text,jsonb,numeric,uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY crypto_fns LOOP
    IF to_regprocedure('public.' || fn) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION public.%s SET search_path = public, extensions;', fn);
      RAISE NOTICE 'search_path -> (public, extensions) on public.%', fn;
    END IF;
  END LOOP;

  -- Legacy unqualified private_create_customer_session(text) alias, if present
  IF to_regprocedure('private_create_customer_session(text)') IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION private_create_customer_session(text) SET search_path = public, extensions;';
    RAISE NOTICE 'search_path -> (public, extensions) on private_create_customer_session(text)';
  END IF;

  -- Any other overloads (e.g. future create_payment_intent variants)
  FOR fn IN
    SELECT oid::regprocedure::text
    FROM pg_proc
    WHERE proname IN ('private_create_customer_session', 'private_customer_from_session', 'create_payment_intent')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions;', fn);
    RAISE NOTICE 'search_path -> (public, extensions) on %', fn;
  END LOOP;
END;
$$;

-- Keep internal helpers out of the anon API (re-assert after recreate).
-- Guarded so the file still runs on DBs where create_payment_intent was
-- never installed (run fix_payment_intents.sql, then re-run this file).
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.private_create_customer_session(TEXT) FROM PUBLIC, anon, authenticated;';
  EXECUTE 'REVOKE ALL ON FUNCTION public.private_customer_from_session(TEXT) FROM PUBLIC, anon, authenticated;';
  EXECUTE 'REVOKE ALL ON FUNCTION private_create_customer_session(TEXT) FROM PUBLIC, anon, authenticated;';
  IF to_regprocedure('public.create_payment_intent(text,text,text,text,text,text,jsonb,numeric,uuid)') IS NOT NULL THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_payment_intent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, UUID) TO anon, authenticated;';
  END IF;
END;
$$;

-- 5. Verification ------------------------------------------------------------
SELECT n.nspname AS pgcrypto_schema
FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname = 'pgcrypto';

SELECT extensions.gen_random_bytes(32) IS NOT NULL AS gen_random_bytes_ok;

SELECT proname::text AS fn,
       COALESCE(proconfig::text, '(none)') AS search_path_setting
FROM pg_proc
WHERE proname IN ('private_create_customer_session', 'private_customer_from_session', 'create_payment_intent')
ORDER BY 1;
