-- =============================================================================
-- RETURN REQUEST AUTHORIZATION (Phase 2 security hardening, part 4)
-- =============================================================================
-- Problem: website_order_returns had "Public insert returns ... WITH CHECK
-- (true)", and the website inserted rows DIRECTLY from the browser with a
-- client-supplied customer_phone. Anyone with the anon key could:
--   - file return/exchange requests against ANY order id (no ownership),
--   - bypass the 2-day window (enforced only in browser JS),
--   - spam the table + attach arbitrary image URLs (quota/phishing),
-- and the Contact page wrote free-form messages the same way.
--
-- Fix:
--   1. customer_request_return(p_token, p_order_id, p_type, p_message,
--      p_media) — session-authed; enforces ownership, delivered status,
--      2-day window (mirrors the website), allowed types, message/media
--      shape limits, media URLs bound to this order's returns/ folder, and
--      one open request per order.
--   2. submit_contact_message(p_name, p_email, p_phone, p_message) — kept
--      public (contact form has no account) but validated + throttled
--      (5/hour per phone or IP) against the auth-attempts log.
--   3. REVOKE INSERT ON website_order_returns FROM anon, so the browser can
--      no longer write rows directly. Reads stay as-is (customer_returns
--      RPC, vendor/admin RLS policies); authenticated staff writes stay.
--
-- Callers updated: website MyOrders (returns) + Contact (messages).
-- Image uploads themselves still go to storage returns/ (anon per the
-- storage fortress file); signed-URL uploads are the follow-up.
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor. Idempotent.
-- Requires: secure_customer_sessions.sql (session helpers) and, for
-- throttling, fix_pin_bruteforce_protection.sql (attempts log). If the
-- attempts table is absent, contact throttling is skipped gracefully.
-- =============================================================================

-- ── 1. Session-authed return requests ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customer_request_return(
    p_token TEXT,
    p_order_id BIGINT,
    p_type TEXT,
    p_message TEXT,
    p_media JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_customer   public.website_customers;
    v_order      public.website_orders;
    v_norm_phone TEXT;
    v_msg        TEXT;
    v_media      JSONB := '[]'::jsonb;
    v_m          RECORD;
    v_return_id  BIGINT;
BEGIN
    -- Session (same system as orders/ratings/cancel).
    v_customer := public.private_customer_from_session(p_token);
    IF v_customer.phone IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'SESSION_EXPIRED: please login again');
    END IF;

    -- Order must exist AND belong to the caller (one message for both).
    SELECT * INTO v_order FROM public.website_orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
    END IF;
    v_norm_phone := right(regexp_replace(COALESCE(v_order.phone, ''), '\D', '', 'g'), 10);
    IF v_norm_phone IS DISTINCT FROM v_customer.phone THEN
        RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
    END IF;

    -- Delivered, inside the 2-day window (mirrors the website button).
    IF lower(COALESCE(v_order.status, '')) <> 'delivered' THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_NOT_ELIGIBLE: only delivered orders can be returned');
    END IF;
    IF v_order.updated_at IS NULL OR v_order.updated_at < now() - interval '2 days' THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_WINDOW_CLOSED: the 2-day return window has passed');
    END IF;

    -- One open request per order (re-request allowed after rejection).
    IF EXISTS (SELECT 1 FROM public.website_order_returns
               WHERE order_id = p_order_id AND status IN ('pending', 'approved')) THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_ALREADY_REQUESTED');
    END IF;

    IF p_type NOT IN ('return', 'exchange') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_RETURN_TYPE');
    END IF;

    v_msg := trim(COALESCE(p_message, ''));
    IF char_length(v_msg) < 1 OR char_length(v_msg) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_MESSAGE: please describe the issue (max 2000 characters)');
    END IF;

    -- Media: array, max 5, each an https image bound to THIS order's folder.
    IF p_media IS NOT NULL AND p_media <> 'null'::jsonb THEN
        IF jsonb_typeof(p_media) <> 'array' THEN
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_MEDIA');
        END IF;
        IF (SELECT count(*) FROM jsonb_array_elements(p_media)) > 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'INVALID_MEDIA: maximum 5 photos');
        END IF;
        FOR v_m IN SELECT value AS v FROM jsonb_array_elements(p_media) LOOP
            IF jsonb_typeof(v_m.v) <> 'object'
               OR COALESCE(v_m.v->>'type', 'image') <> 'image'
               OR v_m.v->>'url' IS NULL
               OR v_m.v->>'url' NOT LIKE 'https://%'
               OR char_length(v_m.v->>'url') > 500
               OR position('/returns/' || p_order_id || '/' IN (v_m.v->>'url')) = 0 THEN
                RETURN jsonb_build_object('success', false, 'error', 'INVALID_MEDIA');
            END IF;
            v_media := v_media || jsonb_build_object(
                'url', v_m.v->>'url', 'type', 'image');
        END LOOP;
    END IF;

    INSERT INTO public.website_order_returns (
        order_id, order_number, customer_phone, type, message, media, status
    ) VALUES (
        v_order.id, v_order.order_number, v_customer.phone,
        p_type, v_msg, v_media, 'pending'
    ) RETURNING id INTO v_return_id;

    RETURN jsonb_build_object('success', true, 'return_id', v_return_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_request_return(TEXT, BIGINT, TEXT, TEXT, JSONB)
TO public, anon, authenticated;

-- ── 2. Public contact messages (validated + throttled, no auth needed) ────
CREATE OR REPLACE FUNCTION public.submit_contact_message(
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_message TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_name  TEXT := trim(COALESCE(p_name, ''));
    v_email TEXT := trim(COALESCE(p_email, ''));
    v_phone TEXT := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 10);
    v_msg   TEXT := trim(COALESCE(p_message, ''));
    v_ip    TEXT := 'unknown';
    v_recent INT;
    v_has_attempts BOOLEAN := false;
BEGIN
    IF char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_NAME');
    END IF;
    IF v_email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
       OR char_length(v_email) > 254 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_EMAIL');
    END IF;
    IF v_phone !~ '^[0-9]{10}$' THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_PHONE');
    END IF;
    IF char_length(v_msg) < 10 OR char_length(v_msg) > 2000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_MESSAGE: 10–2000 characters');
    END IF;

    -- Throttle: max 5 messages/hour per phone or IP (skipped gracefully if
    -- the brute-force migration was never applied).
    SELECT EXISTS (SELECT 1 FROM pg_tables
                   WHERE schemaname = 'public'
                   AND tablename = 'customer_auth_attempts')
    INTO v_has_attempts;
    IF v_has_attempts THEN
        BEGIN
            v_ip := public.private_auth_client_ip();
        EXCEPTION WHEN OTHERS THEN
            v_ip := 'unknown';
        END;
        SELECT count(*) INTO v_recent FROM public.customer_auth_attempts
        WHERE action = 'contact' AND attempted_at > now() - interval '1 hour'
          AND (phone = v_phone OR (v_ip <> 'unknown' AND ip = v_ip));
        IF v_recent >= 5 THEN
            RETURN jsonb_build_object('success', false, 'error', 'TOO_MANY_MESSAGES: please try again later');
        END IF;
        INSERT INTO public.customer_auth_attempts(phone, ip, action)
        VALUES (v_phone, v_ip, 'contact');
    END IF;

    INSERT INTO public.website_order_returns (
        order_id, order_number, customer_phone, type, message, media, status
    ) VALUES (
        NULL, 'CONTACT', v_phone, 'message',
        'Name: ' || v_name || E'\nEmail: ' || v_email || E'\n\nMessage: ' || v_msg,
        '[]'::jsonb, 'pending'
    );

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_contact_message(TEXT, TEXT, TEXT, TEXT)
TO public, anon, authenticated;

-- ── 3. Close the direct-write hole ────────────────────────────────────────
-- Browser table inserts are replaced by the RPCs above. Staff apps use the
-- authenticated role (untouched); reads are untouched.
REVOKE INSERT ON public.website_order_returns FROM anon;
DROP POLICY IF EXISTS "Public insert returns" ON public.website_order_returns;

-- =============================================================================
-- VERIFY (Supabase SQL Editor, after applying):
--   -- a) Anon can no longer insert directly (expect permission error):
--   --    (run as anon via API, or check) 
--   SELECT has_table_privilege('anon', 'public.website_order_returns', 'INSERT');
--   -- expect: f
--   -- b) RPCs callable:
--   SELECT has_function_privilege('anon',
--     'public.customer_request_return(TEXT,BIGINT,TEXT,TEXT,JSONB)', 'EXECUTE');
--   -- expect: t
-- =============================================================================
