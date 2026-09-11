-- =============================================================================
-- PIN BRUTE-FORCE PROTECTION (Phase 2 security hardening)
-- =============================================================================
-- Problem: the customer PIN RPCs (customer_login, customer_register,
-- customer_setup_pin, customer_change_pin, reset_customer_pin,
-- verify_whatsapp_otp) allowed UNLIMITED attempts. A 4-digit PIN has only
-- 10,000 combinations — trivially brute-forced with the public anon key.
-- website_customers already carries login_attempts / locked_until columns,
-- but the live functions never read or write them.
--
-- This script adds server-side throttling (client-side checks are bypassable):
--   - 5 failed attempts on one phone within 15 minutes  -> 15-minute lockout
--   - 30 failed attempts from one IP within 15 minutes  -> 15-minute lockout
--     (slows phone-number spraying even when each phone is tried a few times)
-- Also fixes two latent bugs in the same functions:
--   - reset_customer_pin / verify_whatsapp_otp stored the new PIN in
--     PLAINTEXT (SET pin_hash = p_new_pin), which then failed the bcrypt
--     check in customer_login. They now hash with crypt() like the rest.
--   - verify_whatsapp_otp allowed unlimited OTP guesses; after 5 wrong codes
--     the OTP is now destroyed (caller must request a new one).
--
-- Policy: locked callers get 'ACCOUNT_LOCKED: ...' (raised as an exception
-- for BOOLEAN RPCs, or {success:false, error} JSON for JSONB RPCs) so the
-- website can show "try again later". Wrong-PIN responses stay generic
-- ('Invalid phone number or PIN') to avoid user enumeration.
--
-- HOW TO APPLY: run this whole file in Supabase Dashboard -> SQL Editor.
-- Idempotent: safe to re-run. Verify with the checks at the bottom.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Columns (already exist on fresh restores; IF NOT EXISTS for older DBs)
ALTER TABLE public.website_customers
  ADD COLUMN IF NOT EXISTS login_attempts INT DEFAULT 0;
ALTER TABLE public.website_customers
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- OTP guess counter
ALTER TABLE public.website_otps
  ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0;

-- 2. Attempt log: backs per-phone AND per-IP throttling, including for
-- phone numbers that do not exist yet (setup_pin / enumeration spray).
CREATE TABLE IF NOT EXISTS public.customer_auth_attempts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT 'unknown',
  action TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_auth_attempts_phone_idx
  ON public.customer_auth_attempts (phone, action, attempted_at DESC);
CREATE INDEX IF NOT EXISTS customer_auth_attempts_ip_idx
  ON public.customer_auth_attempts (ip, action, attempted_at DESC);
-- RPCs are SECURITY DEFINER so they bypass RLS; keep the table itself locked.
ALTER TABLE public.customer_auth_attempts ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. Private helpers (NOT granted to anon/authenticated — RPCs only)
-- =============================================================================

-- Best-effort client IP from the PostgREST request headers. Falls back to
-- 'unknown' so throttling still works per-phone when headers are unavailable.
CREATE OR REPLACE FUNCTION public.private_auth_client_ip()
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_headers TEXT;
  v_forwarded TEXT;
BEGIN
  BEGIN
    v_headers := current_setting('request.headers', true);
  EXCEPTION WHEN OTHERS THEN
    RETURN 'unknown';
  END;
  IF v_headers IS NULL THEN RETURN 'unknown'; END IF;
  BEGIN
    v_forwarded := (v_headers::json ->> 'x-forwarded-for');
  EXCEPTION WHEN OTHERS THEN
    RETURN 'unknown';
  END;
  IF v_forwarded IS NULL OR v_forwarded = '' THEN RETURN 'unknown'; END IF;
  -- X-Forwarded-For can be a chain: client, proxy1, proxy2 — take the first.
  RETURN trim(split_part(v_forwarded, ',', 1));
END;
$$;

-- Returns NULL when the caller may proceed, otherwise a lockout message.
CREATE OR REPLACE FUNCTION public.private_auth_check_throttled(p_phone TEXT, p_action TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_locked_until TIMESTAMPTZ;
  v_ip TEXT := public.private_auth_client_ip();
  v_phone_fails INT;
  v_ip_fails INT;
BEGIN
  -- a) Account-level lockout already in effect?
  SELECT locked_until INTO v_locked_until
  FROM public.website_customers WHERE phone = p_phone LIMIT 1;
  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RETURN 'ACCOUNT_LOCKED: too many failed attempts. Please try again later.';
  END IF;

  -- b) Too many recent failures for this phone+action?
  SELECT count(*) INTO v_phone_fails
  FROM public.customer_auth_attempts
  WHERE phone = p_phone AND action = p_action
    AND attempted_at > now() - interval '15 minutes';
  IF v_phone_fails >= 5 THEN
    -- Persist the lock on real accounts so it survives log pruning.
    UPDATE public.website_customers
    SET locked_until = now() + interval '15 minutes',
        login_attempts = COALESCE(login_attempts, 0) + 1
    WHERE phone = p_phone;
    RETURN 'ACCOUNT_LOCKED: too many failed attempts. Please try again in 15 minutes.';
  END IF;

  -- c) Too many recent failures from this IP across all phones (spraying)?
  IF v_ip <> 'unknown' THEN
    SELECT count(*) INTO v_ip_fails
    FROM public.customer_auth_attempts
    WHERE ip = v_ip AND action = p_action
      AND attempted_at > now() - interval '15 minutes';
    IF v_ip_fails >= 30 THEN
      RETURN 'ACCOUNT_LOCKED: too many failed attempts. Please try again in 15 minutes.';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.private_auth_record_failure(p_phone TEXT, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recent INT;
BEGIN
  INSERT INTO public.customer_auth_attempts(phone, ip, action)
  VALUES (p_phone, public.private_auth_client_ip(), p_action);

  -- Lock real accounts at the 5-failure threshold immediately.
  SELECT count(*) INTO v_recent
  FROM public.customer_auth_attempts
  WHERE phone = p_phone AND action = p_action
    AND attempted_at > now() - interval '15 minutes';
  IF v_recent >= 5 THEN
    UPDATE public.website_customers
    SET login_attempts = COALESCE(login_attempts, 0) + 1,
        locked_until = now() + interval '15 minutes'
    WHERE phone = p_phone;
  END IF;

  -- Opportunistic pruning so the log table stays small.
  DELETE FROM public.customer_auth_attempts WHERE attempted_at < now() - interval '1 day';
END;
$$;

CREATE OR REPLACE FUNCTION public.private_auth_record_success(p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.customer_auth_attempts WHERE phone = p_phone;
  UPDATE public.website_customers
  SET login_attempts = 0, locked_until = NULL
  WHERE phone = p_phone;
END;
$$;

-- Helpers must never be callable with the anon key directly.
REVOKE ALL ON FUNCTION public.private_auth_client_ip() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.private_auth_check_throttled(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.private_auth_record_failure(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.private_auth_record_success(TEXT) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. Throttled customer_login (same signature — existing GRANTs preserved)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customer_login(p_phone TEXT, p_pin TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c public.website_customers;
  v_phone TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  v_lock TEXT;
  v_token TEXT;
BEGIN
  v_lock := public.private_auth_check_throttled(v_phone, 'login');
  IF v_lock IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_lock);
  END IF;

  SELECT * INTO c FROM public.website_customers WHERE phone = v_phone LIMIT 1;
  IF c.phone IS NULL OR c.pin_hash <> crypt(p_pin, c.pin_hash) THEN
    PERFORM public.private_auth_record_failure(v_phone, 'login');
    -- Generic on purpose: do not reveal whether the phone exists.
    RETURN jsonb_build_object('success', false, 'error', 'Invalid phone number or PIN');
  END IF;

  PERFORM public.private_auth_record_success(c.phone);
  v_token := public.private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token,
    'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

-- =============================================================================
-- 5. Throttled customer_register (slows mass fake-account creation)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customer_register(p_name TEXT, p_phone TEXT, p_pin TEXT, p_address TEXT, p_city TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_phone TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  c public.website_customers;
  v_lock TEXT;
  v_token TEXT;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 digits'); END IF;

  v_lock := public.private_auth_check_throttled(v_phone, 'register');
  IF v_lock IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_lock);
  END IF;

  IF EXISTS (SELECT 1 FROM public.website_customers WHERE phone = v_phone) THEN
    PERFORM public.private_auth_record_failure(v_phone, 'register');
    RETURN jsonb_build_object('success', false, 'error', 'This phone number is already registered. Please login instead.');
  END IF;

  INSERT INTO public.website_customers(name, phone, pin_hash, address, city)
  VALUES (p_name, v_phone, crypt(p_pin, gen_salt('bf', 12)), p_address, p_city)
  RETURNING * INTO c;
  PERFORM public.private_auth_record_success(c.phone);
  v_token := public.private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token,
    'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

-- =============================================================================
-- 6. Throttled customer_setup_pin (first-time buyer claim flow).
-- NOTE: this RPC sets the PIN on ANY phone without proof of ownership, so it
-- is the most abuse-sensitive endpoint after login. Throttling slows takeover
-- spray; the proper fix is an OTP challenge before setup (follow-up).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customer_setup_pin(p_phone TEXT, p_pin TEXT, p_name TEXT DEFAULT NULL, p_address TEXT DEFAULT NULL, p_city TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_phone TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
  c public.website_customers;
  v_lock TEXT;
  v_token TEXT;
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN RETURN jsonb_build_object('success', false, 'error', 'PIN must be exactly 4 digits'); END IF;

  v_lock := public.private_auth_check_throttled(v_phone, 'setup_pin');
  IF v_lock IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_lock);
  END IF;
  -- Log every claim so IP-wide spraying trips the 30/15min cap.
  PERFORM public.private_auth_record_failure(v_phone, 'setup_pin');

  SELECT * INTO c FROM public.website_customers WHERE phone = v_phone LIMIT 1;
  IF c.phone IS NULL THEN
    INSERT INTO public.website_customers(name, phone, pin_hash, address, city)
    VALUES (COALESCE(NULLIF(p_name, ''), 'Customer'), v_phone, crypt(p_pin, gen_salt('bf', 12)), p_address, p_city)
    RETURNING * INTO c;
  ELSE
    UPDATE public.website_customers
    SET pin_hash = crypt(p_pin, gen_salt('bf', 12)),
        name = COALESCE(NULLIF(p_name, ''), name),
        address = COALESCE(NULLIF(p_address, ''), address),
        city = COALESCE(NULLIF(p_city, ''), city),
        login_attempts = 0, locked_until = NULL
    WHERE phone = v_phone RETURNING * INTO c;
  END IF;
  v_token := public.private_create_customer_session(c.phone);
  RETURN jsonb_build_object('success', true, 'session_token', v_token,
    'customer', jsonb_build_object('phone', c.phone, 'name', c.name, 'address', c.address, 'city', c.city, 'shopy_coins', c.shopy_coins, 'created_at', c.created_at));
END;
$$;

-- =============================================================================
-- 7. Throttled customer_change_pin (session-authed; locked raises so the
-- website can tell "locked out" apart from "wrong current PIN").
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customer_change_pin(p_token TEXT, p_current_pin TEXT, p_new_pin TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  c public.website_customers := public.private_customer_from_session(p_token);
  v_lock TEXT;
BEGIN
  IF c.phone IS NULL THEN RETURN false; END IF;
  IF p_new_pin !~ '^[0-9]{4}$' THEN RETURN false; END IF;

  v_lock := public.private_auth_check_throttled(c.phone, 'change_pin');
  IF v_lock IS NOT NULL THEN
    RAISE EXCEPTION '%', v_lock;
  END IF;

  IF c.pin_hash <> crypt(p_current_pin, c.pin_hash) THEN
    PERFORM public.private_auth_record_failure(c.phone, 'change_pin');
    RETURN false;
  END IF;

  UPDATE public.website_customers
  SET pin_hash = crypt(p_new_pin, gen_salt('bf', 12))
  WHERE phone = c.phone;
  PERFORM public.private_auth_record_success(c.phone);
  RETURN true;
END;
$$;

-- =============================================================================
-- 8. Throttled + bcrypt-fixed reset_customer_pin (self-service KBA reset).
-- Locked raises ACCOUNT_LOCKED so the website can show "try again later"
-- instead of the generic verification-failed message.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reset_customer_pin(
    p_phone TEXT,
    p_order_number TEXT,
    p_total_amount NUMERIC,
    p_new_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_match BOOLEAN;
    v_lock TEXT;
    -- Normalized phone for throttle bookkeeping only. The order/customer
    -- lookups below keep the exact-match semantics they always had.
    v_throttle_phone TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
BEGIN
    IF p_new_pin !~ '^[0-9]{4}$' THEN
        RAISE EXCEPTION 'INVALID_PIN_FORMAT: PIN must be exactly four digits';
    END IF;

    v_lock := public.private_auth_check_throttled(v_throttle_phone, 'reset_pin');
    IF v_lock IS NOT NULL THEN
        RAISE EXCEPTION '%', v_lock;
    END IF;

    v_match := EXISTS (
        SELECT 1 FROM public.website_orders
        WHERE phone = p_phone
        AND order_number = p_order_number
        AND total_amount = p_total_amount
    );

    IF v_match THEN
        UPDATE public.website_customers
        SET pin_hash = crypt(p_new_pin, gen_salt('bf', 12)),
            login_attempts = 0,
            locked_until = NULL
        WHERE phone = p_phone;
        PERFORM public.private_auth_record_success(v_throttle_phone);
        -- New PIN invalidates existing sessions (stolen-session safety).
        DELETE FROM public.customer_sessions WHERE customer_phone = p_phone;
        RETURN TRUE;
    ELSE
        PERFORM public.private_auth_record_failure(v_throttle_phone, 'reset_pin');
        RETURN FALSE;
    END IF;
END;
$$;

-- =============================================================================
-- 9. OTP-guessing cap + bcrypt fix for verify_whatsapp_otp.
-- After 5 wrong codes the OTP is destroyed and the caller must request a new
-- one (also throttled per phone via the 'otp' action).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.verify_whatsapp_otp(
    p_phone TEXT,
    p_code TEXT,
    p_new_pin TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_row public.website_otps;
    v_lock TEXT;
    v_throttle_phone TEXT := right(regexp_replace(p_phone, '\D', '', 'g'), 10);
BEGIN
    IF p_new_pin !~ '^[0-9]{4}$' THEN
        RAISE EXCEPTION 'INVALID_PIN_FORMAT: PIN must be exactly four digits';
    END IF;

    v_lock := public.private_auth_check_throttled(v_throttle_phone, 'otp');
    IF v_lock IS NOT NULL THEN
        RAISE EXCEPTION '%', v_lock;
    END IF;

    SELECT * INTO v_row FROM public.website_otps WHERE phone = p_phone LIMIT 1;
    IF v_row.phone IS NULL OR v_row.expires_at <= now() THEN
        DELETE FROM public.website_otps WHERE phone = p_phone;
        PERFORM public.private_auth_record_failure(v_throttle_phone, 'otp');
        RETURN FALSE;
    END IF;

    IF v_row.otp_code <> p_code THEN
        UPDATE public.website_otps
        SET attempts = COALESCE(attempts, 0) + 1
        WHERE phone = p_phone;
        PERFORM public.private_auth_record_failure(v_throttle_phone, 'otp');
        -- Burn the OTP after 5 wrong guesses so it cannot be brute-forced.
        DELETE FROM public.website_otps
        WHERE phone = p_phone AND COALESCE(attempts, 0) >= 5;
        RETURN FALSE;
    END IF;

    UPDATE public.website_customers
    SET pin_hash = crypt(p_new_pin, gen_salt('bf', 12)),
        login_attempts = 0,
        locked_until = NULL
    WHERE phone = p_phone;
    PERFORM public.private_auth_record_success(v_throttle_phone);
    DELETE FROM public.website_otps WHERE phone = p_phone;
    DELETE FROM public.customer_sessions WHERE customer_phone = p_phone;
    RETURN TRUE;
END;
$$;

-- Explicit grants for the recreated RPCs (CREATE OR REPLACE normally keeps
-- them, but reset/OTP historically had none — make anon access deterministic).
GRANT EXECUTE ON FUNCTION public.customer_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_register(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_setup_pin(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_change_pin(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_customer_pin(TEXT, TEXT, NUMERIC, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_whatsapp_otp(TEXT, TEXT, TEXT) TO anon, authenticated;

-- =============================================================================
-- VERIFY (run after applying):
--   -- a) Helpers locked away from the anon key:
--   SELECT has_function_privilege('anon',
--     'public.private_auth_check_throttled(TEXT,TEXT)', 'EXECUTE');  -- expect f
--   -- b) RPCs still callable:
--   SELECT has_function_privilege('anon',
--     'public.customer_login(TEXT,TEXT)', 'EXECUTE');                -- expect t
--   -- c) Dry-run lockout on a test phone (6th bad login locks 15 min):
--   SELECT public.customer_login('9800000000', '0000');  -- x6, then check
--   SELECT phone, login_attempts, locked_until
--   FROM public.website_customers WHERE phone = '9800000000';
--   SELECT count(*) FROM public.customer_auth_attempts
--   WHERE phone = '9800000000';
-- =============================================================================
