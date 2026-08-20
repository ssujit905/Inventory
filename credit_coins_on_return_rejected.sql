-- =============================================================================
-- FEATURE: Customer gets 15 Shopy Coins when their return request is REJECTED
-- =============================================================================
-- Behavior:
--   * When a return/exchange request transitions to status 'rejected', the
--     customer's wallet is credited +15 shopy coins (compensation).
--   * Fires only on the transition INTO 'rejected' (pending -> rejected, or an
--     INSERT that starts as 'rejected'), so repeated saves never double-credit.
--   * Approved / completed / pending requests do NOT grant coins.
-- =============================================================================

-- Audit log table (referenced by the order RPCs too). Safe to re-run.
CREATE TABLE IF NOT EXISTS public.coin_transactions (
    id BIGSERIAL PRIMARY KEY,
    customer_phone TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'adjustment',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION credit_coins_on_return_rejected()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_phone TEXT;
BEGIN
    IF NEW.status <> 'rejected' THEN
        RETURN NEW;
    END IF;

    -- Only fire on the transition into 'rejected' (skip UPDATEs that were
    -- already rejected, e.g. re-saving the same row or toggling).
    IF TG_OP = 'UPDATE' AND OLD.status = 'rejected' THEN
        RETURN NEW;
    END IF;

    -- Find the customer who owns the order this request belongs to
    SELECT o.phone INTO v_phone
    FROM website_orders o
    WHERE o.id = NEW.order_id
    LIMIT 1;

    IF v_phone IS NOT NULL THEN
        UPDATE website_customers
        SET shopy_coins = COALESCE(shopy_coins, 0) + 15
        WHERE phone = v_phone;

        INSERT INTO coin_transactions (customer_phone, amount, type, description)
        VALUES (v_phone, 15, 'return_rejected', 'Return request rejected - compensation');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_return_rejected_credit_coins ON website_order_returns;
CREATE TRIGGER on_return_rejected_credit_coins
AFTER INSERT OR UPDATE OF status ON website_order_returns
FOR EACH ROW EXECUTE FUNCTION credit_coins_on_return_rejected();

-- Verification:
-- SELECT * FROM coin_transactions WHERE type = 'return_rejected' ORDER BY created_at DESC LIMIT 5;