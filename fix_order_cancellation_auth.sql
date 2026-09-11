-- =============================================================================
-- ORDER CANCELLATION AUTHORIZATION (Phase 2 security hardening, part 3)
-- =============================================================================
-- Problem (IDOR): handle_website_order_cancellation(p_order_id, p_reason)
-- took no session token. Order ids are sequential integers, so anyone with
-- the public anon key could cancel ANYONE's processing order (restock chaos,
-- refund abuse) with a one-line console call.
--
-- Fix: the RPC now takes the customer session token and enforces —
--   - valid session (else SESSION_EXPIRED),
--   - ownership: order.phone must match the session phone, normalized to
--     the last 10 digits (else NOT_AUTHORIZED — same message for missing
--     orders vs foreign orders, so ids can't be probed),
--   - cancellable state: status must be processing/pending AND payment must
--     not already be confirmed (mirrors the website, which only offers
--     Cancel on unshipped + unpaid orders),
--   - idempotency kept: cancelling an already-cancelled order is a no-op so
--     double-clicks never restore stock twice.
-- Service-role callers (the payment-gateway edge auto-cancel on price
-- mismatch) pass no token and are allowed via auth.role() = 'service_role'.
-- Plain anon/authenticated callers without a token get NOT_AUTHORIZED.
--
-- The old 2-arg overload is DROPPED so every caller resolves to the guarded
-- version (the new 3rd parameter defaults to NULL). Callers:
--   - website MyOrders confirmCancelOrder -> now sends p_token (updated),
--   - payment-gateway edge completeIntentOrder -> unchanged (service role).
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor. Idempotent.
-- =============================================================================

-- Remove the unguarded overload first (same transaction: no window where
-- both exist, no window where neither exists for valid callers).
DROP FUNCTION IF EXISTS public.handle_website_order_cancellation(BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public.handle_website_order_cancellation(
    p_order_id BIGINT,
    p_reason TEXT,
    p_token TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_customer   public.website_customers;
    v_order      public.website_orders;
    v_is_internal BOOLEAN := false;
    v_norm_phone TEXT;
    v_trans      RECORD;
BEGIN
    -- ── 1. Who is calling? ────────────────────────────────────────────
    IF p_token IS NOT NULL AND p_token <> '' THEN
        v_customer := public.private_customer_from_session(p_token);
        IF v_customer.phone IS NULL THEN
            RAISE EXCEPTION 'SESSION_EXPIRED: please login again';
        END IF;
    ELSIF auth.role() = 'service_role' THEN
        -- Internal automation (payment-gateway edge price-mismatch cancel).
        v_is_internal := true;
    ELSE
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    -- ── 2. Load order (same message for missing vs foreign: no probing) ─
    SELECT * INTO v_order FROM public.website_orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED';
    END IF;

    -- Idempotent: double-clicks / retries never restore stock twice.
    IF v_order.status = 'cancelled' THEN
        RETURN;
    END IF;

    -- ── 3. Customer-path guards (mirrors the website Cancel button) ─────
    IF NOT v_is_internal THEN
        v_norm_phone := right(regexp_replace(COALESCE(v_order.phone, ''), '\D', '', 'g'), 10);
        IF v_norm_phone IS DISTINCT FROM v_customer.phone THEN
            RAISE EXCEPTION 'NOT_AUTHORIZED';
        END IF;

        IF lower(COALESCE(v_order.status, '')) NOT IN ('processing', 'pending') THEN
            RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE: order is already %', v_order.status;
        END IF;

        IF lower(COALESCE(v_order.payment_status, '')) = 'paid' THEN
            RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE: payment already confirmed — please contact support';
        END IF;
    END IF;

    -- ── 4. Cancel + restore stock to source lots (unchanged logic) ───────
    UPDATE public.website_orders
    SET status = 'cancelled', notes = p_reason, updated_at = NOW()
    WHERE id = p_order_id;

    IF v_order.sale_id IS NOT NULL THEN
        UPDATE public.sales SET parcel_status = 'cancelled' WHERE id = v_order.sale_id;

        FOR v_trans IN
            SELECT product_id, lot_id, ABS(quantity_changed) as qty
            FROM public.transactions
            WHERE sale_id = v_order.sale_id AND type = 'sale'
        LOOP
            IF v_trans.lot_id IS NOT NULL THEN
                UPDATE public.product_lots
                SET quantity_remaining = quantity_remaining + v_trans.qty
                WHERE id = v_trans.lot_id;
            END IF;

            INSERT INTO public.transactions (product_id, lot_id, sale_id, type, quantity_changed, performed_by)
            VALUES (v_trans.product_id, v_trans.lot_id, v_order.sale_id, 'cancel', v_trans.qty, (SELECT id FROM public.profiles LIMIT 1));
        END LOOP;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_website_order_cancellation(BIGINT, TEXT, TEXT)
TO public, anon, authenticated;

-- =============================================================================
-- VERIFY (Supabase SQL Editor, after applying):
--   -- a) Old overload gone, guarded version present:
--   SELECT oid::regprocedure FROM pg_proc
--   WHERE proname = 'handle_website_order_cancellation';
--   -- expect exactly: ...(bigint, text, text)
--   -- b) Tokenless call is rejected (expect NOT_AUTHORIZED):
--   SELECT public.handle_website_order_cancellation(1, 'probe');
--   -- c) Legit cancel: website MyOrders Cancel button with a live session.
-- =============================================================================
