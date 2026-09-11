-- =============================================================================
-- SERVER-SIDE PAYMENT INTENTS (Phase 2 security hardening, part 2)
-- =============================================================================
-- Problem: the eSewa/Fonepay flows trusted the browser end to end —
--   1. Checkout sent client-computed amounts to the payment-gateway edge
--      function, which signed whatever it received. Tamper grandTotal to
--      Rs.10 and the gateway happily charges Rs.10 for a Rs.5000 cart.
--   2. PaymentSuccess created the order from sessionStorage data and marked
--      it 'paid' via confirm_website_payment(order_number) with NO ownership
--      check, NO amount comparison, and a guessable order number. Anyone
--      could mark anyone's order paid, or skip the gateway entirely by
--      calling both RPCs from the console.
--
-- Fix: payment intents. The browser never handles money again:
--   1. Checkout calls create_payment_intent(items[{variant_id, quantity}])
--      -> the server reprices with private_compute_order_pricing() (the same
--      math as create_atomic_website_order) and stores the quote + order
--      snapshot, returning only an intent_token.
--   2. The edge function signs gateway charges from the stored intent
--      (expected_total), never from browser amounts.
--   3. On callback, the edge verifies the gateway signature AND that the
--      paid amount == intent.expected_total AND the gateway ref matches,
--      then creates the order (service role) from the stored snapshot and
--      marks it paid — all server-side.
--   4. confirm_website_payment is REVOKED from anon/authenticated below, so
--      the browser can no longer flip orders to 'paid'. (COD orders never
--      call it; the website sets payment_status at creation.)
--
-- RUN ORDER: fix_server_side_pricing.sql FIRST (provides the pricing
-- helper), then this file. Both idempotent.
-- After applying + deploying the updated edge function, the website changes
-- (Checkout/PaymentSuccess intent flow) take effect on next Vercel deploy.
-- =============================================================================

-- ── Intent store (RLS on, no policies: RPCs + service role only) ──────────
CREATE TABLE IF NOT EXISTS public.website_payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The browser holds the raw token once; only its SHA-256 is stored, so a
  -- DB leak does not hand out payable intents.
  token_hash TEXT NOT NULL UNIQUE,
  gateway TEXT NOT NULL CHECK (gateway IN ('esewa', 'fonepay')),
  -- eSewa transaction_uuid / Fonepay PRN, assigned by the edge function.
  gateway_ref TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  phone2 TEXT DEFAULT '',
  address TEXT NOT NULL,
  city TEXT DEFAULT 'Kathmandu',
  -- Minimal snapshot: [{variant_id, quantity}]. Prices are re-derived.
  items JSONB NOT NULL,
  coins_used NUMERIC NOT NULL DEFAULT 0,
  ad_id UUID,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  shipping_fee NUMERIC NOT NULL DEFAULT 0,
  expected_total NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'expired', 'cancelled')),
  order_id BIGINT,
  order_number TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '45 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS website_payment_intents_token_idx
  ON public.website_payment_intents (token_hash);
CREATE INDEX IF NOT EXISTS website_payment_intents_ref_idx
  ON public.website_payment_intents (gateway, gateway_ref);
CREATE INDEX IF NOT EXISTS website_payment_intents_status_idx
  ON public.website_payment_intents (status, expires_at);
ALTER TABLE public.website_payment_intents ENABLE ROW LEVEL SECURITY;

-- ── Create an intent (browser entry point for gateway checkout) ───────────
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
    v_quote      JSONB;
    v_coins_used NUMERIC;
    v_total      NUMERIC;
    v_token      TEXT := encode(gen_random_bytes(32), 'hex');
    v_gateway    TEXT;
    v_slim_items JSONB;
    v_intent_id  UUID;
    v_expires    TIMESTAMPTZ;
BEGIN
    -- Gateway methods only. COD creates its order directly via
    -- create_atomic_website_order and never needs an intent.
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

    -- Authoritative quote. Raises on bad items / sold out / disallowed
    -- method, exactly like order creation would.
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

    -- Store the minimal snapshot (ids + quantities, never prices).
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
        encode(digest(v_token, 'sha256'), 'hex'), v_gateway,
        trim(p_customer_name), p_phone, COALESCE(p_phone2, ''),
        trim(p_address), p_city, v_slim_items, v_coins_used, p_ad_id,
        (v_quote->>'subtotal')::numeric, (v_quote->>'shipping_fee')::numeric,
        v_total, v_expires
    ) RETURNING id INTO v_intent_id;

    -- Opportunistic pruning of stale intents.
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
$$;

GRANT EXECUTE ON FUNCTION public.create_payment_intent(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, UUID)
TO public, anon, authenticated;

-- ── Close the browser 'mark paid' hole ────────────────────────────────────
-- After the website + edge function move to intents, no browser flow may
-- flip payment_status. Service-role (edge) and staff sessions bypass RLS/
-- grants and are unaffected. COD orders never called this RPC.
REVOKE ALL ON FUNCTION public.confirm_website_payment(TEXT, TEXT, TEXT)
FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- VERIFY (Supabase SQL Editor, after applying):
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'create_payment_intent';
--   SELECT has_function_privilege('anon',
--     'public.confirm_website_payment(TEXT,TEXT,TEXT)', 'EXECUTE');  -- expect f
--   -- Tamper test: create_payment_intent with inflated quantities/prices in
--   -- p_items returns DB-derived totals; extra JSON keys are ignored.
-- =============================================================================
