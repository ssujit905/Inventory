-- ============================================================
-- FIX: Rating Coins — Pending until Return Window Closes
-- ============================================================
-- PROBLEM:
--   customer_submit_rating granted +25 coins IMMEDIATELY when a
--   delivered order was rated, so a customer could rate, get the
--   coins, then return the product and keep the coins.
--
-- NEW BEHAVIOR:
--   1. Rating a delivered order does NOT add spendable coins.
--      The reward is stored as reward_status = 'pending' and the
--      customer can SEE it (pending_coins) but cannot use it.
--   2. Coins become ACTIVE only when the 2-day return window has
--      closed (order delivered > 2 days ago) AND no return request
--      exists AND the order was not returned/cancelled.
--      (Lazy evaluation inside customer_session_profile.)
--   3. If the product is returned (or order cancelled / return
--      requested), the pending coins are LOST (reward_status =
--      'voided') and never become active.
--   4. Safety trigger: if an order is marked returned/cancelled
--      AFTER coins were already granted (e.g. late admin action),
--      the coins are clawed back (floor at 0) and the reward voided.
-- ============================================================

-- ── 1. RATING: no immediate grant, mark as pending ──────────
CREATE OR REPLACE FUNCTION customer_submit_rating(p_token TEXT, p_order_id BIGINT, p_product_id BIGINT, p_rating INT, p_comment TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
BEGIN
  IF c.phone IS NULL OR p_rating NOT BETWEEN 1 AND 5 THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM website_orders o JOIN website_order_items i ON i.order_id=o.id WHERE o.id=p_order_id AND o.phone=c.phone AND i.product_id=p_product_id AND o.status='delivered') THEN RETURN false; END IF;
  -- No rating while a return/exchange request is open (pending/approved/completed)
  IF EXISTS (SELECT 1 FROM website_order_returns r WHERE r.order_id = p_order_id AND r.status IN ('pending', 'approved', 'completed')) THEN RETURN false; END IF;
  INSERT INTO website_product_ratings(order_id, product_id, customer_phone, customer_name, rating, comment, reward_status)
  VALUES (p_order_id, p_product_id, c.phone, c.name, p_rating, p_comment, 'pending');
  -- NOTE: No UPDATE to shopy_coins here. Coins stay pending.
  RETURN true;
END;
$$;

-- ── 2. PROFILE: lazy maturation + pending_coins in response ──
CREATE OR REPLACE FUNCTION customer_session_profile(p_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE c website_customers := private_customer_from_session(p_token);
        v_granted NUMERIC := 0;
BEGIN
  IF c.phone IS NULL THEN RETURN jsonb_build_object('success', false); END IF;

  -- (a) GRANT: return window closed (>2 days since delivery), no return request,
  --     order not returned/cancelled -> coins become active.
  WITH mature AS (
    UPDATE website_product_ratings r
    SET reward_status = 'granted'
    FROM website_orders o
    WHERE r.order_id = o.id
      AND r.customer_phone = c.phone
      AND r.reward_status = 'pending'
      AND o.updated_at <= NOW() - INTERVAL '2 days'
      AND o.status NOT IN ('returned', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM website_order_returns wor
        WHERE wor.order_id = o.id
          AND wor.status IN ('pending', 'approved', 'completed')
      )
    RETURNING r.id
  )
  SELECT COUNT(*) * 25 INTO v_granted FROM mature;

  IF v_granted > 0 THEN
    UPDATE website_customers
    SET shopy_coins = COALESCE(shopy_coins, 0) + v_granted
    WHERE phone = c.phone;
  END IF;

  -- (b) VOID: returned/cancelled orders (or open return request) -> showing
  --     coins are lost and never become active.
  UPDATE website_product_ratings r
  SET reward_status = 'voided'
  FROM website_orders o
  WHERE r.order_id = o.id
    AND r.customer_phone = c.phone
    AND r.reward_status = 'pending'
    AND (
      o.status IN ('returned', 'cancelled')
      OR EXISTS (
        SELECT 1 FROM website_order_returns wor
        WHERE wor.order_id = o.id
          AND wor.status IN ('pending', 'approved', 'completed')
      )
    );

  SELECT * INTO c FROM website_customers WHERE phone = c.phone;
  RETURN jsonb_build_object('success', true, 'customer', jsonb_build_object(
    'phone', c.phone,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'shopy_coins', COALESCE(c.shopy_coins, 0),
    'pending_coins', (SELECT COALESCE(SUM(25), 0) FROM website_product_ratings WHERE customer_phone = c.phone AND reward_status = 'pending'),
    'created_at', c.created_at
  ));
END;
$$;

-- ── 3. SAFETY TRIGGER: clawback if order closes AFTER grant ──
CREATE OR REPLACE FUNCTION clawback_rating_coins_on_order_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_coins NUMERIC;
    v_phone TEXT;
BEGIN
    IF NEW.status IN ('returned', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status THEN
        SELECT o.phone INTO v_phone FROM website_orders o WHERE o.id = NEW.id;

        SELECT COALESCE(SUM(25), 0) INTO v_coins
        FROM website_product_ratings r
        WHERE r.order_id = NEW.id
          AND r.reward_status IS DISTINCT FROM 'voided';

        IF v_coins > 0 THEN
            UPDATE website_customers
            SET shopy_coins = GREATEST(COALESCE(shopy_coins, 0) - v_coins, 0)
            WHERE phone = v_phone;

            UPDATE website_product_ratings
            SET reward_status = 'voided'
            WHERE order_id = NEW.id
              AND reward_status IS DISTINCT FROM 'voided';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_close_clawback_coins ON website_orders;
CREATE TRIGGER on_order_close_clawback_coins
AFTER UPDATE OF status ON website_orders
FOR EACH ROW EXECUTE FUNCTION clawback_rating_coins_on_order_close();

GRANT EXECUTE ON FUNCTION customer_submit_rating(TEXT, BIGINT, BIGINT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION customer_session_profile(TEXT) TO anon, authenticated;