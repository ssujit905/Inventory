-- ============================================================
-- REVERT: Old rating logic — immediate 25 coins, no pending
-- ============================================================
-- Restores pre-pending-coins behavior:
--   1. Rating a delivered order grants +25 shopy_coins IMMEDIATELY.
--   2. No pending_coins, no 2-day wait, no void on return.
--   3. No +15 compensation on return rejected.
--   4. Return window (2-day) for filing returns is KEPT (separate concern).
--
-- HOW TO APPLY: run in Supabase Dashboard -> SQL Editor.
-- ============================================================

-- ── 1. Drop pending-related triggers ──────────────────────────
DROP TRIGGER IF EXISTS on_order_close_clawback_coins ON website_orders;
DROP TRIGGER IF EXISTS on_return_rejected_credit_coins ON website_order_returns;
DROP FUNCTION IF EXISTS clawback_rating_coins_on_order_close();
DROP FUNCTION IF EXISTS credit_coins_on_return_rejected();

-- ── 2. OLD RATING: immediate +25 grant ────────────────────────
CREATE OR REPLACE FUNCTION customer_submit_rating(p_token TEXT, p_order_id BIGINT, p_product_id BIGINT, p_rating INT, p_comment TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM website_orders o JOIN website_order_items i ON i.order_id=o.id WHERE o.id=p_order_id AND o.phone=c.phone AND i.product_id=p_product_id AND o.status='delivered') THEN RETURN false; END IF;
  INSERT INTO website_product_ratings(order_id, product_id, customer_phone, customer_name, rating, comment) VALUES (p_order_id, p_product_id, c.phone, c.name, p_rating, p_comment);
  UPDATE website_customers SET shopy_coins=COALESCE(shopy_coins,0)+25 WHERE phone=c.phone;
  RETURN true;
END;
$$;

-- ── 3. OLD PROFILE: no pending_coins, no lazy grant/void ──────
CREATE OR REPLACE FUNCTION customer_session_profile(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false); END IF;
  SELECT * INTO c FROM website_customers WHERE phone = c.phone;
  RETURN jsonb_build_object('success', true, 'customer', jsonb_build_object(
    'phone', c.phone,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'shopy_coins', COALESCE(c.shopy_coins, 0),
    'pending_coins', 0,
    'created_at', c.created_at
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION customer_submit_rating(TEXT, BIGINT, BIGINT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION customer_session_profile(TEXT) TO anon, authenticated;

-- NOTE: website_product_ratings.reward_status column is left in place
-- (unused) so old rows don't break. New ratings ignore it.
