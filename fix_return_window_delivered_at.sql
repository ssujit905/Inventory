-- =============================================================================
-- 2-DAY RETURN / EXCHANGE WINDOW: use the actual delivery timestamp
-- =============================================================================
-- Problem: both the website button (MyOrders.jsx) and customer_request_return
-- used website_orders.updated_at as a proxy for "delivered at". updated_at is
-- bumped by ANY later write (payment sync, re-saving the delivered status,
-- staff edits), which silently re-opens the 2-day window.
--
-- Fix:
--   1. Add website_orders.delivered_at, backfilled from updated_at for orders
--      that are already delivered.
--   2. Trigger keeps delivered_at exact: set once when the order transitions
--      to delivered, cleared if it leaves delivered.
--   3. customer_request_return enforces the window against delivered_at
--      (falling back to updated_at for legacy rows).
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor. Idempotent.
-- =============================================================================

-- ── 1. Column + backfill ──────────────────────────────────────────────────
ALTER TABLE public.website_orders
    ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

UPDATE public.website_orders
SET delivered_at = COALESCE(updated_at, created_at, now())
WHERE lower(COALESCE(status, '')) = 'delivered'
  AND delivered_at IS NULL;

-- ── 2. Keep delivered_at exact on every status change ─────────────────────
CREATE OR REPLACE FUNCTION public.private_set_website_order_delivered_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF lower(COALESCE(NEW.status, '')) = 'delivered' THEN
        -- Set on the transition into delivered; never reset it afterwards.
        IF lower(COALESCE(OLD.status, '')) <> 'delivered' OR NEW.delivered_at IS NULL THEN
            NEW.delivered_at := now();
        END IF;
    ELSE
        NEW.delivered_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_website_order_delivered_at ON public.website_orders;
CREATE TRIGGER trg_website_order_delivered_at
BEFORE UPDATE ON public.website_orders
FOR EACH ROW
EXECUTE FUNCTION public.private_set_website_order_delivered_at();

-- ── 3. Enforce the window against the real delivery time ───────────────────
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

    -- Delivered, inside the 2-day window from the actual delivery time.
    IF lower(COALESCE(v_order.status, '')) <> 'delivered' THEN
        RETURN jsonb_build_object('success', false, 'error', 'RETURN_NOT_ELIGIBLE: only delivered orders can be returned');
    END IF;
    IF COALESCE(v_order.delivered_at, v_order.updated_at) IS NULL
       OR COALESCE(v_order.delivered_at, v_order.updated_at) < now() - interval '2 days' THEN
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

-- =============================================================================
-- VERIFY (after applying):
--   SELECT id, status, delivered_at, updated_at
--   FROM public.website_orders
--   WHERE lower(status) = 'delivered'
--   ORDER BY delivered_at DESC NULLS LAST
--   LIMIT 10;
-- =============================================================================
